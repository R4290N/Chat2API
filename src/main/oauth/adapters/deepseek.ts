/**
 * DeepSeek Authentication Adapter
 * Authentication method: Login using default browser, manually extract token
 */

import axios from 'axios'
import { shell } from 'electron'
import { BaseOAuthAdapter } from './base'
import { deepSeekBrowserHeaders } from '../../providers/fingerprint'
import {
  OAuthResult,
  OAuthOptions,
  TokenValidationResult,
  CredentialInfo,
  AdapterConfig,
  OAuthCallbackData,
} from '../types'

const DEEPSEEK_API_BASE = 'https://chat.deepseek.com'

const FAKE_HEADERS = {
  Pragma: 'no-cache',
  Priority: 'u=1, i',
  ...deepSeekBrowserHeaders(),
}

export class DeepSeekAdapter extends BaseOAuthAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      providerType: 'deepseek',
      authMethods: ['manual'],
      loginUrl: DEEPSEEK_API_BASE,
      apiUrl: DEEPSEEK_API_BASE,
    })
  }

  /**
   * Start login flow - Open default browser
   */
  async startLogin(options: OAuthOptions): Promise<OAuthResult> {
    this.emitProgress('pending', 'Opening browser...')
    
    try {
      await shell.openExternal(DEEPSEEK_API_BASE)
      this.emitProgress('pending', 'Please log in via browser and enter Token manually')
      
      return {
        success: false,
        providerId: options.providerId,
        providerType: 'deepseek',
        error: 'Please log in via browser, extract Token from Developer Tools and enter manually',
      }
    } catch (error) {
      console.error('[DeepSeek] startLogin error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to open browser'
      this.emitProgress('error', errorMessage)
      
      return {
        success: false,
        providerId: options.providerId,
        providerType: 'deepseek',
        error: errorMessage,
      }
    }
  }

  /**
   * Complete authentication with manually entered token
   */
  async loginWithToken(providerId: string, token: string): Promise<OAuthResult> {
    this.emitProgress('pending', 'Validating Token...')
    
    try {
      const validation = await this.validateToken({ token })
      
      if (!validation.valid) {
        return {
          success: false,
          providerId,
          providerType: 'deepseek',
          error: validation.error || 'Token validation failed',
        }
      }
      
      this.emitProgress('success', 'Token validation successful')
      
      return {
        success: true,
        providerId,
        providerType: 'deepseek',
        credentials: { token },
        accountInfo: validation.accountInfo,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emitProgress('error', `Token validation failed: ${errorMessage}`)
      
      return {
        success: false,
        providerId,
        providerType: 'deepseek',
        error: errorMessage,
      }
    }
  }

  /**
   * Handle callback (DeepSeek does not support)
   */
  protected async processCallback(data: OAuthCallbackData): Promise<void> {
    // DeepSeek does not support OAuth callback
  }

  /**
   * Validate token validity
   */
  async validateToken(credentials: Record<string, string>): Promise<TokenValidationResult> {
    const token = credentials.token || credentials.userToken
    
    if (!token) {
      return {
        valid: false,
        error: 'Token cannot be empty',
      }
    }
    
    try {
      const response = await axios.get(`${DEEPSEEK_API_BASE}/api/v0/users/current`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...FAKE_HEADERS,
        },
        timeout: 15000,
        validateStatus: () => true,
      })
      
      console.log('[DeepSeek OAuth] Response:', response.status, response.data)
      
      if (response.status !== 200 || !response.data) {
        return {
          valid: false,
          error: 'Token is invalid or expired',
        }
      }
      
      // DeepSeek API returns: { code: 0, msg: '', data: { biz_code: 0, biz_msg: '', biz_data: { ... } } }
      const bizData = response.data?.data?.biz_data
      
      if (!bizData) {
        return {
          valid: false,
          error: 'Token validation failed: Invalid response data',
        }
      }
      
      return {
        valid: true,
        tokenType: 'access',
        accountInfo: {
          userId: bizData.id,
          email: bizData.email,
          name: bizData.name,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation request failed'
      return {
        valid: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(credentials: Record<string, string>): Promise<CredentialInfo | null> {
    const token = credentials.token || credentials.refreshToken
    
    if (!token) {
      return null
    }
    
    try {
      const response = await axios.get(`${DEEPSEEK_API_BASE}/api/v0/users/current`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...FAKE_HEADERS,
        },
        timeout: 15000,
        validateStatus: () => true,
      })
      
      if (response.status !== 200 || !response.data?.biz_data?.token) {
        return null
      }
      
      const newToken = response.data.biz_data.token
      
      return {
        type: 'access',
        value: newToken,
        expiresAt: this.getTimestamp() + 3600,
      }
    } catch {
      return null
    }
  }
}

export default DeepSeekAdapter
