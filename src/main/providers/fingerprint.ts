/**
 * Browser fingerprint shared by every request that talks to chat.deepseek.com.
 *
 * The defaults below describe "Chrome 148 on Windows with a Russian locale"
 * and act only as a fallback. At startup the main process detects this
 * machine's real browser (default browser + its version from the registry,
 * system language) and applies it via configureFingerprint(), so the
 * emulated client matches the browser that actually runs on this machine
 * and never goes stale.
 *
 * Keep this module free of electron/node imports: it is loaded from shared
 * provider config code.
 */

export interface BrowserFingerprint {
  /** Full User-Agent string. */
  userAgent: string
  /** sec-ch-ua value; empty when the browser sends no client hints (e.g. Firefox). */
  secChUa: string
  /** Accept-Language value. */
  acceptLanguage: string
  /** DeepSeek X-Client-Locale, e.g. "ru_RU". */
  locale: string
}

const DEFAULT_FINGERPRINT: BrowserFingerprint = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  secChUa: '"Chromium";v="148", "Google Chrome";v="148", "Not-A.Brand";v="24"',
  acceptLanguage: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  locale: 'ru_RU',
}

let currentFingerprint: BrowserFingerprint = { ...DEFAULT_FINGERPRINT }

/** Applies values detected from this machine; omitted fields keep their defaults. */
export function configureFingerprint(overrides: Partial<BrowserFingerprint>): void {
  currentFingerprint = { ...currentFingerprint, ...overrides }
}

/** Snapshot of the fingerprint used for outgoing requests. */
export function getBrowserFingerprint(): BrowserFingerprint {
  return { ...currentFingerprint }
}

/**
 * Builds Accept-Language Chrome-style for a BCP-47 locale:
 * ru-RU -> "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
 * en-US -> "en-US,en;q=0.9".
 */
export function buildAcceptLanguage(locale: string): string {
  const primary = locale || 'en-US'
  const base = primary.split('-')[0]
  const parts = [primary]
  if (base && base !== primary) {
    parts.push(`${base};q=0.9`)
  }
  if (base !== 'en') {
    parts.push('en-US;q=0.8', 'en;q=0.7')
  }
  return parts.join(',')
}

/**
 * User-Agent + sec-ch-ua for a Chromium browser with the given full version
 * (e.g. "154.0.8037.93"). Edge appends its own token to the UA.
 */
export function buildChromiumIdentity(
  browser: 'chrome' | 'edge',
  version: string
): { userAgent: string; secChUa: string } {
  const major = version.split('.')[0]
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  if (browser === 'edge') {
    return {
      userAgent: `${userAgent} Edg/${version}`,
      secChUa: `"Chromium";v="${major}", "Microsoft Edge";v="${major}", "Not-A.Brand";v="24"`,
    }
  }
  return {
    userAgent,
    secChUa: `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not-A.Brand";v="24"`,
  }
}

/**
 * Seconds east of UTC, the unit DeepSeek uses (28800 for UTC+8).
 * Taken from the system timezone so the header matches the real region.
 */
export function timezoneOffsetSeconds(): string {
  return String(-new Date().getTimezoneOffset() * 60)
}

/** Complete browser-lookalike header set for chat.deepseek.com API calls. */
export function deepSeekBrowserHeaders(): Record<string, string> {
  const fingerprint = currentFingerprint
  const headers: Record<string, string> = {
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': fingerprint.acceptLanguage,
    Origin: 'https://chat.deepseek.com',
    Referer: 'https://chat.deepseek.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': fingerprint.userAgent,
    'X-App-Version': '2.0.0',
    'X-Client-Locale': fingerprint.locale,
    'X-Client-Platform': 'web',
    'x-Client-Timezone-Offset': timezoneOffsetSeconds(),
    'X-Client-Version': '2.0.0',
  }
  if (fingerprint.secChUa) {
    headers['Sec-Ch-Ua'] = fingerprint.secChUa
    headers['Sec-Ch-Ua-Mobile'] = '?0'
    headers['Sec-Ch-Ua-Platform'] = '"Windows"'
  }
  return headers
}

/** User-Agent of the current fingerprint (detected from this machine). */
export function browserUserAgent(): string {
  return currentFingerprint.userAgent
}

/** Accept-Language of the current fingerprint. */
export function browserAcceptLanguage(): string {
  return currentFingerprint.acceptLanguage
}

/** sec-ch-ua of the current fingerprint ("" when the browser sends none). */
export function browserSecChUa(): string {
  return currentFingerprint.secChUa
}

/** Locale like "ru_RU" as used in provider payloads. */
export function browserLocale(): string {
  return currentFingerprint.locale
}

/** BCP-47 language tag like "ru-RU". */
export function browserLanguageTag(): string {
  return currentFingerprint.locale.replace(/_/g, '-')
}

/** Primary language subtag like "ru". */
export function browserLanguage(): string {
  return browserLanguageTag().split('-')[0]
}

/** IANA timezone id of this machine, e.g. "Europe/Astrakhan". */
export function systemTimeZoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Signed minute offset like "-480" (UTC+8), the unit some payloads use. */
export function timezoneOffsetMinutes(): string {
  return String(new Date().getTimezoneOffset())
}

/**
 * Local time like "Mon Feb 23 2026 22:06:02 GMT+0800" - Date.toString()
 * without the trailing "(zone name)" part, matching the original header.
 */
export function localDateTimeString(): string {
  return new Date().toString().replace(/\s*\([^)]*\)$/, '')
}
