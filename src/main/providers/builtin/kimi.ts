import type { BuiltinProviderConfig } from '../../store/types'
import { browserAcceptLanguage, browserSecChUa, browserUserAgent } from '../fingerprint.ts'

export const kimiConfig: BuiltinProviderConfig = {
  id: 'kimi',
  name: 'Kimi',
  type: 'builtin',
  authType: 'jwt',
  apiEndpoint: 'https://www.kimi.com',
  chatPath: '/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
  headers: {
    'Content-Type': 'application/connect+json',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': browserAcceptLanguage(),
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Origin': 'https://www.kimi.com',
    'Sec-Ch-Ua': browserSecChUa(),
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': browserUserAgent(),
    'Priority': 'u=1, i',
  },
  enabled: true,
  description: 'Kimi K3 AI assistant by Moonshot, supports thinking mode and web search',
  supportedModels: [
    'Kimi-K3',
    'Kimi-K2.6',
  ],
  modelMappings: {
    'Kimi-K3': 'kimi-k3',
    'Kimi-K2.6': 'kimi-k2.6',
  },
  credentialFields: [
    {
      name: 'token',
      label: '访问令牌',
      type: 'password',
      required: true,
      placeholder: '请输入 Kimi 访问令牌或刷新令牌',
      helpText: '浏览器 Cookie 中的 kimi-auth 字段值（推荐），或 JWT Token / refresh_token',
    },
  ],
  tokenCheckEndpoint: '/api/auth/token/refresh',
  tokenCheckMethod: 'GET',
}

export default kimiConfig
