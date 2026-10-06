/**
 * Browser fingerprint shared by every request that talks to chat.deepseek.com.
 *
 * Each part of the app used to keep its own copy of these headers, and the
 * copies drifted apart (Chrome 134/145/148, macOS vs Windows, zh_CN vs
 * zh-CN). The server sees a single client, so mismatched copies are a
 * scripting tell. All DeepSeek-facing code must import the values from here
 * instead of keeping local copies.
 */

/** Windows 10/11 UA matching BROWSER_SEC_CH_UA below. */
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

/** sec-ch-ua value Chrome 148 actually sends (GREASE brand last). */
export const BROWSER_SEC_CH_UA = '"Chromium";v="148", "Google Chrome";v="148", "Not-A.Brand";v="24"'

/** Default Accept-Language of a Russian Chrome install. */
export const BROWSER_ACCEPT_LANGUAGE = 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'

/** Locale reported to DeepSeek; must stay consistent with Accept-Language. */
export const DEEPSEEK_LOCALE = 'ru_RU'

/**
 * Seconds east of UTC, the unit DeepSeek uses (28800 for UTC+8).
 * Taken from the system timezone so the header matches the real region.
 */
export function timezoneOffsetSeconds(): string {
  return String(-new Date().getTimezoneOffset() * 60)
}

/** Complete browser-lookalike header set for chat.deepseek.com API calls. */
export function deepSeekBrowserHeaders(): Record<string, string> {
  return {
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': BROWSER_ACCEPT_LANGUAGE,
    Origin: 'https://chat.deepseek.com',
    Referer: 'https://chat.deepseek.com/',
    'Sec-Ch-Ua': BROWSER_SEC_CH_UA,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': BROWSER_UA,
    'X-App-Version': '2.0.0',
    'X-Client-Locale': DEEPSEEK_LOCALE,
    'X-Client-Platform': 'web',
    'x-Client-Timezone-Offset': timezoneOffsetSeconds(),
    'X-Client-Version': '2.0.0',
  }
}
