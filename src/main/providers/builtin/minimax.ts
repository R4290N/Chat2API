import type { BuiltinProviderConfig } from '../../store/types'
import { browserAcceptLanguage, browserSecChUa, browserUserAgent } from '../fingerprint.ts'

export const minimaxConfig: BuiltinProviderConfig = {
  id: 'minimax',
  name: 'MiniMax',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://agent.minimaxi.com',
  chatPath: '/matrix/api/v1/chat/send_msg',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': browserAcceptLanguage(),
    'Cache-Control': 'no-cache',
    'Origin': 'https://agent.minimaxi.com',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': browserSecChUa(),
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': browserUserAgent(),
  },
  enabled: true,
  description: 'MiniMax Agent - AI assistant with MCP multi-agent collaboration',
  supportedModels: [
    'MiniMax-M3',
    'MiniMax-M2.7',
  ],
  modelMappings: {
    'MiniMax-M3': 'MiniMax-M3',
    'MiniMax-M2.7': 'MiniMax-M2.7',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'JWT Token',
      type: 'password',
      required: true,
      placeholder: 'Enter MiniMax JWT Token or realUserID+JWTtoken',
      helpText: 'Format: "realUserID+JWTtoken" or just JWT token (will extract userID from JWT)',
    },
    {
      name: 'realUserID',
      label: 'Real User ID (Optional)',
      type: 'text',
      required: false,
      placeholder: 'Enter Real User ID (optional)',
      helpText: 'If provided, use this instead of JWT user ID. Can also use format: realUserID+JWTtoken in token field',
    },
  ],
  tokenCheckEndpoint: '/v1/api/user/device/register',
  tokenCheckMethod: 'POST',
}

export default minimaxConfig
