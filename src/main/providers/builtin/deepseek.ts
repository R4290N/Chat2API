import type { BuiltinProviderConfig } from '../../store/types'
import { deepSeekBrowserHeaders } from '../fingerprint.ts'

export const deepseekConfig: BuiltinProviderConfig = {
  id: 'deepseek',
  name: 'DeepSeek',
  type: 'builtin',
  authType: 'userToken',
  apiEndpoint: 'https://chat.deepseek.com/api',
  chatPath: '/v0/chat/completion',
  headers: {
    'Content-Type': 'application/json',
    ...deepSeekBrowserHeaders(),
  },
  enabled: true,
  description: 'DeepSeek AI assistant, supports deep thinking and web search',
  supportedModels: ['deepseek-v4.1-flash', 'deepseek-v4-flash', 'deepseek-v4-pro'],
  modelMappings: {
    'deepseek-v4.1-flash': 'deepseek-v4.1-flash',
    'deepseek-v4-flash': 'deepseek-v4-flash',
    'deepseek-v4-pro': 'deepseek-v4-pro',
  },
  credentialFields: [
    {
      name: 'token',
      label: 'User Token',
      type: 'password',
      required: true,
      placeholder: 'Enter DeepSeek user token',
      helpText: 'Authentication token obtained from DeepSeek web version, found in browser DevTools Application -> Local Storage',
    },
  ],
  tokenCheckEndpoint: '/v0/users/current',
  tokenCheckMethod: 'GET',
}

export default deepseekConfig
