/**
 * Detects the real browser identity of this machine and applies it to the
 * shared fingerprint module (providers/fingerprint.ts).
 *
 * Windows only. Every failure falls back silently to the module defaults,
 * so a missing registry key never breaks outgoing requests.
 *
 * What is read:
 * - default browser: HKCU\...\UrlAssociations\http\UserChoice\ProgId
 * - browser version: Chrome/Edge BLBeacon "version" keys
 * - system language:  HKCU\Control Panel\International\LocaleName
 */
import { execFileSync } from 'child_process'
import {
  buildAcceptLanguage,
  buildChromiumIdentity,
  configureFingerprint,
  type BrowserFingerprint,
} from './providers/fingerprint.ts'

const CHROME_VERSION_KEYS: Array<[string, string]> = [
  ['HKLM', 'SOFTWARE\\Google\\Chrome\\BLBeacon'],
  ['HKCU', 'SOFTWARE\\Google\\Chrome\\BLBeacon'],
  ['HKLM', 'SOFTWARE\\WOW6432Node\\Google\\Chrome\\BLBeacon'],
]

const EDGE_VERSION_KEYS: Array<[string, string]> = [
  ['HKLM', 'SOFTWARE\\Microsoft\\Edge\\BLBeacon'],
  ['HKLM', 'SOFTWARE\\WOW6432Node\\Microsoft\\Edge\\BLBeacon'],
  ['HKCU', 'SOFTWARE\\Microsoft\\Edge\\BLBeacon'],
]

function readRegValue(root: string, key: string, name: string): string | undefined {
  try {
    const output = execFileSync('reg', ['query', `${root}\\${key}`, '/v', name], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const match = output.match(/REG_\w+\s+(.+)/)
    return match ? match[1].trim() : undefined
  } catch {
    return undefined
  }
}

function readBrowserVersion(keys: Array<[string, string]>): string | undefined {
  for (const [root, key] of keys) {
    const version = readRegValue(root, key, 'version')
    if (version) {
      return version
    }
  }
  return undefined
}

let initialized = false

/** Safe to call more than once; only the first call performs detection. */
export function initSystemFingerprint(): void {
  if (initialized) {
    return
  }
  initialized = true
  if (process.platform !== 'win32') {
    return
  }

  try {
    const progId = readRegValue(
      'HKCU',
      'Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
      'ProgId'
    )
    const localeName = readRegValue('HKCU', 'Control Panel\\International', 'LocaleName')

    const overrides: Partial<BrowserFingerprint> = {}

    // The default browser decides which story we tell: Edge gets its own UA,
    // everything else (Chrome, Brave, Vivaldi, ...) is served a Chrome identity.
    const browser = progId && /^MSEdge/i.test(progId) ? 'edge' : 'chrome'
    const version =
      browser === 'edge'
        ? readBrowserVersion(EDGE_VERSION_KEYS) ?? readBrowserVersion(CHROME_VERSION_KEYS)
        : readBrowserVersion(CHROME_VERSION_KEYS)
    if (version) {
      const identity = buildChromiumIdentity(browser, version)
      overrides.userAgent = identity.userAgent
      overrides.secChUa = identity.secChUa
    }

    if (localeName) {
      overrides.locale = localeName.replace(/-/g, '_')
      overrides.acceptLanguage = buildAcceptLanguage(localeName)
    }

    if (Object.keys(overrides).length > 0) {
      configureFingerprint(overrides)
      console.log(
        `[Fingerprint] UA=${overrides.userAgent ?? '(default)'} locale=${overrides.locale ?? '(default)'}`
      )
    }
  } catch (error) {
    console.error('[Fingerprint] detection failed, using defaults:', error)
  }
}

// Detect at import time: the app entry imports this module first, so every
// provider module evaluated afterwards builds its module-level header objects
// with the detected identity. The call is idempotent.
initSystemFingerprint()
