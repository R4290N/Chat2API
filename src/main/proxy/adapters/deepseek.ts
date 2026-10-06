/**
 * DeepSeek Adapter
 * Implements DeepSeek web API protocol
 * 
 * NOTE: Tool prompt injection is handled by Forwarder.transformRequestForPromptToolUse()
 * This adapter only handles message format conversion and API communication
 */

import axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import mime from 'mime-types'
import { getDeepSeekHash } from '../../lib/challenge'
import type { Account, Provider } from '../../store/types'
import { resolveDeepSeekChatOptions } from './providerModelOptions'
import { getProviderToolProfile } from '../toolCalling/providerProfiles'
import { deepSeekBrowserHeaders } from '../../providers/fingerprint'

const DEEPSEEK_API_BASE = 'https://chat.deepseek.com/api'

/** File upload endpoint (web UI uploads images/docs here, then references them via ref_file_ids) */
const DEEPSEEK_UPLOAD_PATH = '/api/v0/file/upload_file'
/** Max images per request (web UI allows more, but keep requests sane) */
const MAX_IMAGES_PER_REQUEST = 10
/** Max upload size (web UI default limit is 100MB) */
const IMAGE_MAX_SIZE = 100 * 1024 * 1024
/** File parse statuses that mean "no longer waiting" */
const FILE_READY_STATUSES = new Set([
  'success',
  'succeeded',
  'done',
  'ok',
  'failed',
  'reject',
  'rejected',
  'empty',
  'content_empty',
  'content_filter',
])

interface TokenInfo {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface ChallengeResponse {
  algorithm: string
  challenge: string
  salt: string
  difficulty: number
  expire_at: number
  signature: string
}

interface DeepSeekContentPart {
  type: string
  text?: string
  image_url?: { url?: string }
  file_url?: { url?: string }
}

interface DeepSeekMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | DeepSeekContentPart[] | null
  tool_call_id?: string
  tool_calls?: any[]
}

interface ChatCompletionRequest {
  model: string
  messages: DeepSeekMessage[]
  stream?: boolean
  temperature?: number
  web_search?: boolean
  reasoning_effort?: 'low' | 'medium' | 'high'
  tools?: any[]
  tool_choice?: any
}

const tokenCache = new Map<string, TokenInfo>()
const sessionCache = new Map<string, { sessionId: string; createdAt: number }>()

function generateRandomString(length: number, charset: string = 'alphanumeric'): string {
  const sets = {
    numeric: '0123456789',
    alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    alphanumeric: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    hex: '0123456789abcdef',
  }
  const chars = sets[charset as keyof typeof sets] || sets.alphanumeric
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function generateCookie(): string {
  const timestamp = Date.now()
  return `intercom-HWWAFSESTIME=${timestamp}; HWWAFSESID=${generateRandomString(18, 'hex')}; Hm_lvt_${uuid(false)}=${Math.floor(timestamp / 1000)},${Math.floor(timestamp / 1000)},${Math.floor(timestamp / 1000)}; Hm_lpvt_${uuid(false)}=${Math.floor(timestamp / 1000)}; _frid=${uuid(false)}; _fr_ssid=${uuid(false)}; _fr_pvid=${uuid(false)}`
}

function unixTimestamp(): number {
  return Math.floor(Date.now() / 1000)
}

export class DeepSeekAdapter {
  private provider: Provider
  private account: Account
  private token: string

  constructor(provider: Provider, account: Account) {
    this.provider = provider
    this.account = account
    this.token = account.credentials.token || account.credentials.apiKey || account.credentials.refreshToken || ''
    console.log('[DeepSeek] Using token: <redacted>, length:', this.token.length)
  }

  private async acquireToken(): Promise<string> {
    if (!this.token) {
      throw new Error('DeepSeek Token not configured, please add Token in account settings')
    }

    const cached = tokenCache.get(this.token)
    if (cached && cached.expiresAt > unixTimestamp()) {
      return cached.accessToken
    }

    console.log('[DeepSeek] Acquiring token...')
    
    const result = await axios.get(`${DEEPSEEK_API_BASE}/v0/users/current`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...deepSeekBrowserHeaders(),
      },
      timeout: 15000,
      validateStatus: () => true,
    })

    console.log('[DeepSeek] Token response status:', result.status)
    
    if (result.status === 401 || result.status === 403) {
      throw new Error(`Token invalid or expired, please get a new Token`)
    }

    if (result.status !== 200) {
      throw new Error(`Failed to acquire token: HTTP ${result.status}`)
    }

    // Response structure: { code: 0, data: { biz_code: 0, biz_data: { token: "..." } } }
    const bizData = result.data?.data?.biz_data || result.data?.biz_data
    if (!bizData?.token) {
      const errorMsg = result.data?.msg || result.data?.data?.biz_msg || 'Unknown error'
      console.log('[DeepSeek] Token response data:', JSON.stringify(result.data, null, 2))
      throw new Error(`Failed to acquire token: ${errorMsg}`)
    }

    const accessToken = bizData.token
    tokenCache.set(this.token, {
      accessToken,
      refreshToken: this.token,
      expiresAt: unixTimestamp() + 3600,
    })

    console.log('[DeepSeek] Token acquired successfully')
    return accessToken
  }

  private async createSession(): Promise<string> {
    const cacheKey = this.account.id
    const cached = sessionCache.get(cacheKey)
    if (cached && Date.now() - cached.createdAt < 300000) {
      return cached.sessionId
    }

    const token = await this.acquireToken()
    const result = await axios.post(
      `${DEEPSEEK_API_BASE}/v0/chat_session/create`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...deepSeekBrowserHeaders(),
          Cookie: generateCookie(),
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    )

    console.log('[DeepSeek] Create session response:', JSON.stringify(result.data, null, 2))

    // Response structure: { code: 0, data: { biz_code: 0, biz_data: { id: "..." } } }
    const bizData = result.data?.data?.biz_data || result.data?.biz_data
    if (result.status !== 200 || !bizData?.chat_session?.id) {
      throw new Error(`Failed to create session: ${result.data?.msg || result.data?.data?.biz_msg || result.status}`)
    }

    const sessionId = bizData?.chat_session?.id
    sessionCache.set(cacheKey, { sessionId, createdAt: Date.now() })

    return sessionId
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const token = await this.acquireToken()
      const result = await axios.post(
        `${DEEPSEEK_API_BASE}/v0/chat_session/delete`,
        { chat_session_id: sessionId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...deepSeekBrowserHeaders(),
          },
          timeout: 15000,
          validateStatus: () => true,
        }
      )

      console.log('[DeepSeek] Delete session response:', JSON.stringify(result.data, null, 2))

      const success = result.status === 200 && result.data?.code === 0
      if (success) {
        // Clear cache
        const cacheKey = this.account.id
        sessionCache.delete(cacheKey)
        console.log('[DeepSeek] Session deleted:', sessionId)
      }
      return success
    } catch (error) {
      console.error('[DeepSeek] Failed to delete session:', error)
      return false
    }
  }

  private async getChallenge(targetPath: string): Promise<ChallengeResponse> {
    const token = await this.acquireToken()
    const result = await axios.post(
      `${DEEPSEEK_API_BASE}/v0/chat/create_pow_challenge`,
      { target_path: targetPath },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...deepSeekBrowserHeaders(),
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    )

    // Response structure: { code: 0, data: { biz_code: 0, biz_data: { challenge: {...} } } }
    const bizData = result.data?.data?.biz_data || result.data?.biz_data
    if (result.status !== 200 || !bizData?.challenge) {
      throw new Error(`Failed to get challenge: ${result.data?.msg || result.data?.data?.biz_msg || result.status}`)
    }

    return bizData.challenge
  }

  private async calculateChallengeAnswer(
    challenge: ChallengeResponse,
    targetPath: string = '/api/v0/chat/completion'
  ): Promise<string> {
    const { algorithm, challenge: challengeStr, salt, difficulty, expire_at, signature } = challenge
    
    if (algorithm !== 'DeepSeekHashV1') {
      throw new Error(`Unsupported algorithm: ${algorithm}`)
    }
    
    console.log('[DeepSeek] Challenge parameters:', { difficulty })
    
    const deepSeekHash = await getDeepSeekHash()
    const answer = deepSeekHash.calculateHash(algorithm, challengeStr, salt, difficulty, expire_at)
    
    if (answer === undefined) {
      throw new Error('Challenge calculation failed')
    }
    
    console.log('[DeepSeek] Challenge answer found:', answer)

    return Buffer.from(JSON.stringify({
      algorithm,
      challenge: challengeStr,
      salt,
      answer,
      signature,
      target_path: targetPath,
    })).toString('base64')
  }

  /**
   * Extract image URLs (OpenAI image_url content parts) from messages.
   * Supports base64 data: URIs (Krita plugin uses these) and http(s) URLs.
   */
  private extractImageUrls(messages: DeepSeekMessage[]): string[] {
    const urls: string[] = []
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue
      for (const part of message.content) {
        if (part && typeof part === 'object' && part.type === 'image_url') {
          const url = part.image_url?.url
          if (typeof url === 'string' && url.length > 0) {
            urls.push(url)
          }
        }
      }
    }
    return urls
  }

  /**
   * Upload an image using the web UI flow:
   *   POST /api/v0/file/upload_file (multipart "file" + per-path PoW challenge)
   *   -> biz_data.id -> referenced as ref_file_ids in chat/completion.
   */
  private async uploadImage(
    imageUrl: string,
    options: { modelType: string; thinkingEnabled: boolean }
  ): Promise<string> {
    const token = await this.acquireToken()

    let buffer: Buffer
    let filename: string
    let mimeType: string

    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;,]+)?(;base64)?,/)
      if (!match || !match[2]) {
        throw new Error('DeepSeek image upload: only base64 data URIs are supported')
      }
      mimeType = match[1] || 'image/png'
      buffer = Buffer.from(imageUrl.slice(match[0].length), 'base64')
      const ext = mime.extension(mimeType) || 'png'
      filename = `image-${uuid().slice(0, 8)}.${ext}`
    } else if (/^https?:\/\//i.test(imageUrl)) {
      const download = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        maxContentLength: IMAGE_MAX_SIZE,
        timeout: 60000,
        validateStatus: () => true,
      })
      if (download.status !== 200) {
        throw new Error(`DeepSeek image upload: failed to download image (HTTP ${download.status})`)
      }
      buffer = Buffer.from(download.data)
      mimeType = String(download.headers['content-type'] || '').split(';')[0] || 'image/png'
      const ext = mime.extension(mimeType) || 'png'
      filename = `image-${uuid().slice(0, 8)}.${ext}`
    } else {
      throw new Error('DeepSeek image upload: unsupported image URL scheme')
    }

    if (buffer.length === 0) {
      throw new Error('DeepSeek image upload: empty image data')
    }
    if (buffer.length > IMAGE_MAX_SIZE) {
      throw new Error('DeepSeek image upload: image exceeds 100MB limit')
    }

    const formData = new FormData()
    formData.append('file', buffer, { filename, contentType: mimeType })

    // The upload path requires its own PoW challenge (same as the web UI does)
    const challenge = await this.getChallenge(DEEPSEEK_UPLOAD_PATH)
    const powAnswer = await this.calculateChallengeAnswer(challenge, DEEPSEEK_UPLOAD_PATH)

    console.log('[DeepSeek] Uploading image:', filename, `${buffer.length} bytes`, 'modelType:', options.modelType)

    // NB: DEEPSEEK_API_BASE already contains /api, so the URL path is /v0/... here,
    // while DEEPSEEK_UPLOAD_PATH keeps the full /api/v0/... form for the PoW target.
    const result = await axios.post(`${DEEPSEEK_API_BASE}/v0/file/upload_file`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...deepSeekBrowserHeaders(),
        Cookie: generateCookie(),
        'X-Ds-Pow-Response': powAnswer,
        'x-thinking-enabled': options.thinkingEnabled ? '1' : '0',
        'x-model-type': options.modelType,
        'x-file-size': String(buffer.length),
        ...formData.getHeaders(),
      },
      maxBodyLength: IMAGE_MAX_SIZE,
      timeout: 120000,
      validateStatus: () => true,
    })

    if (result.status !== 200) {
      throw new Error(`DeepSeek image upload failed: HTTP ${result.status}`)
    }

    // Some responses come back as text; log the raw shape for diagnostics
    const rawBody = typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
    console.log(
      '[DeepSeek] Upload response:',
      result.status,
      String(result.headers['content-type'] || ''),
      rawBody?.slice(0, 600)
    )

    // Response shape: { code: 0, data: { biz_code: 0, biz_data: { id, status, ... } } }
    const biz = result.data?.data ?? result.data
    const bizCode = biz?.biz_code
    const bizData = biz?.biz_data
    if (bizCode !== 0 || !bizData?.id) {
      const message = biz?.biz_msg || result.data?.msg || result.data?.message || 'unknown error'
      throw new Error(`DeepSeek image upload failed: ${message} (biz_code: ${bizCode})`)
    }

    const fileId = String(bizData.id)
    console.log('[DeepSeek] Image uploaded, file id:', fileId, 'status:', bizData.status)

    await this.waitForFileReady(fileId, token)
    return fileId
  }

  /**
   * Best-effort wait until the uploaded file finishes server-side parsing.
   * Images are usually ready immediately after upload.
   */
  private async waitForFileReady(fileId: string, token: string): Promise<void> {
    const deadline = Date.now() + 15000
    let lastStatus: unknown = undefined

    while (Date.now() < deadline) {
      try {
        const result = await axios.get(`${DEEPSEEK_API_BASE}/v0/file/fetch_files`, {
          params: { file_ids: fileId },
          headers: {
            Authorization: `Bearer ${token}`,
            ...deepSeekBrowserHeaders(),
          },
          timeout: 10000,
          validateStatus: () => true,
        })
        const files = result.data?.data?.biz_data?.files
        const status = Array.isArray(files) ? files[0]?.status : undefined
        lastStatus = status
        if (status === undefined || status === null) {
          return
        }
        if (typeof status !== 'string') {
          return
        }
        if (FILE_READY_STATUSES.has(status.toLowerCase())) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (error) {
        console.warn(
          '[DeepSeek] File status check failed, proceeding:',
          error instanceof Error ? error.message : error
        )
        return
      }
    }

    console.log('[DeepSeek] File still not ready after wait, proceeding. status:', lastStatus)
  }

  private messagesToPrompt(messages: DeepSeekMessage[], isMultiTurn: boolean = false): string {
    const toolProfile = getProviderToolProfile('deepseek')
    const processedMessages = messages.map(message => {
      let text: string

      // Handle tool calls in assistant message
      if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
        text = toolProfile.formatAssistantToolCalls(message.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })))
      }
      // Handle tool response message
      else if (message.role === 'tool' && message.tool_call_id) {
        text = toolProfile.formatToolResult({
          toolCallId: message.tool_call_id,
          content: String(message.content || ''),
        })
      }
      else if (Array.isArray(message.content)) {
        const texts = message.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
        text = texts.join('\n')
      } else {
        text = String(message.content || '')
      }
      return { role: message.role, text }
    })

    if (processedMessages.length === 0) return ''

    // For multi-turn mode, only send the last user message
    if (isMultiTurn) {
      let lastUserIdx = -1
      for (let i = processedMessages.length - 1; i >= 0; i--) {
        if (processedMessages[i].role === 'user') {
          lastUserIdx = i
          break
        }
      }
      
      if (lastUserIdx !== -1) {
        const lastUserMsg = processedMessages[lastUserIdx]
        let text = lastUserMsg.text
        for (let i = lastUserIdx + 1; i < processedMessages.length; i++) {
          if (processedMessages[i].role === 'tool') {
            text += `\n\n${processedMessages[i].text}`
          }
        }
        return `<｜User｜>${text}`
      }
    }

    const mergedBlocks: { role: string; text: string }[] = []
    let currentBlock = { ...processedMessages[0] }

    for (let i = 1; i < processedMessages.length; i++) {
      const msg = processedMessages[i]
      if (msg.role === currentBlock.role) {
        currentBlock.text += `\n\n${msg.text}`
      } else {
        mergedBlocks.push(currentBlock)
        currentBlock = { ...msg }
      }
    }
    mergedBlocks.push(currentBlock)

    return mergedBlocks
      .map((block, index) => {
        if (block.role === 'assistant') {
          return `<｜Assistant｜>${block.text}<｜end of sentence｜>`
        }
        if (block.role === 'user' || block.role === 'system') {
          return index > 0 ? `<｜User｜>${block.text}` : block.text
        }
        if (block.role === 'tool') {
          return `<｜User｜>${block.text}`
        }
        return block.text
      })
      .join('')
      .replace(/!\[.+\]\(.+\)/g, '')
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{ response: AxiosResponse; sessionId: string }> {
    const token = await this.acquireToken()
    
    const sessionId = await this.createSession()
    console.log('[DeepSeek] Created new session:', sessionId)
    
    const challenge = await this.getChallenge('/api/v0/chat/completion')
    const challengeAnswer = await this.calculateChallengeAnswer(challenge)

    // Clone messages to avoid modifying original request
    // Note: Tool prompt injection is already handled by Forwarder.transformRequestForPromptToolUse()
    const messages = [...request.messages]

    let prompt = this.messagesToPrompt(messages, false)

    const { modelType, searchEnabled, thinkingEnabled } = resolveDeepSeekChatOptions(request, prompt)

    if (request.web_search || request.model.toLowerCase().includes('search')) {
      console.log('[DeepSeek] Web search enabled')
    }

    if (request.reasoning_effort || thinkingEnabled) {
      console.log('[DeepSeek] Reasoning mode enabled, effort:', request.reasoning_effort)
    }

    // Vision: upload attached images first, then reference them via ref_file_ids
    // (this is exactly how the web client sends images to the model)
    const imageUrls = this.extractImageUrls(messages)
    let refFileIds: string[] = []
    if (imageUrls.length > 0) {
      const toUpload = imageUrls.slice(0, MAX_IMAGES_PER_REQUEST)
      if (imageUrls.length > MAX_IMAGES_PER_REQUEST) {
        console.warn(
          `[DeepSeek] ${imageUrls.length} images in request, uploading first ${MAX_IMAGES_PER_REQUEST}`
        )
      }
      for (const url of toUpload) {
        const fileId = await this.uploadImage(url, { modelType, thinkingEnabled })
        refFileIds.push(fileId)
      }
      console.log('[DeepSeek] Attached files to request:', refFileIds.join(', '))
    }

    const response = await axios.post(
      `${DEEPSEEK_API_BASE}/v0/chat/completion`,
      {
        chat_session_id: sessionId,
        parent_message_id: null,
        prompt,
        model_type: modelType,
        ref_file_ids: refFileIds,
        search_enabled: searchEnabled,
        thinking_enabled: thinkingEnabled,
        preempt: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...deepSeekBrowserHeaders(),
          Referer: `https://chat.deepseek.com/a/chat/s/${sessionId}`,
          Cookie: generateCookie(),
          'X-Ds-Pow-Response': challengeAnswer,
        },
        timeout: 120000,
        validateStatus: () => true,
        responseType: 'stream',
      }
    )

    return { response, sessionId }
  }

  async deleteAllChats(): Promise<boolean> {
    try {
      const token = await this.acquireToken()
      const result = await axios.post(
        `${DEEPSEEK_API_BASE}/v0/chat_session/delete_all`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...deepSeekBrowserHeaders(),
          },
          timeout: 30000,
          validateStatus: () => true,
        }
      )

      console.log('[DeepSeek] Delete all chats response:', JSON.stringify(result.data, null, 2))

      const success = result.status === 200 && result.data?.code === 0
      if (success) {
        sessionCache.clear()
        console.log('[DeepSeek] All chats deleted')
      }
      return success
    } catch (error) {
      console.error('[DeepSeek] Failed to delete all chats:', error)
      return false
    }
  }

  static isDeepSeekProvider(provider: Provider): boolean {
    return provider.id === 'deepseek' || provider.apiEndpoint.includes('deepseek.com')
  }

  /**
   * Clear session cache for a specific account
   * This should be called when a session is deleted externally (e.g., from web)
   */
  static clearSessionCache(accountId: string): void {
    sessionCache.delete(accountId)
    console.log('[DeepSeek] Cleared session cache for account:', accountId)
  }
}

export const deepSeekAdapter = {
  DeepSeekAdapter,
}
