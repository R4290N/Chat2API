import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAcceptLanguage,
  buildChromiumIdentity,
  configureFingerprint,
  deepSeekBrowserHeaders,
  getBrowserFingerprint,
} from '../../src/main/providers/fingerprint.ts'

test('default fingerprint is Chrome 148 on Windows with Russian locale', () => {
  const headers = deepSeekBrowserHeaders()
  assert.equal(
    headers['User-Agent'],
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
  )
  assert.equal(
    headers['Sec-Ch-Ua'],
    '"Chromium";v="148", "Google Chrome";v="148", "Not-A.Brand";v="24"'
  )
  assert.equal(headers['Sec-Ch-Ua-Mobile'], '?0')
  assert.equal(headers['Sec-Ch-Ua-Platform'], '"Windows"')
  assert.equal(headers['Accept-Language'], 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7')
  assert.equal(headers['X-Client-Locale'], 'ru_RU')
  assert.equal(headers['Origin'], 'https://chat.deepseek.com')
  assert.match(headers['x-Client-Timezone-Offset'], /^-?\d+$/)
})

test('buildAcceptLanguage follows Chrome conventions', () => {
  assert.equal(buildAcceptLanguage('ru-RU'), 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7')
  assert.equal(buildAcceptLanguage('en-US'), 'en-US,en;q=0.9')
  assert.equal(buildAcceptLanguage('uk-UA'), 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7')
  assert.equal(buildAcceptLanguage(''), 'en-US,en;q=0.9')
})

test('buildChromiumIdentity builds chrome and edge identities', () => {
  const chrome = buildChromiumIdentity('chrome', '154.0.8037.93')
  assert.match(chrome.userAgent, /Chrome\/154\.0\.0\.0 Safari\/537\.36$/)
  assert.doesNotMatch(chrome.userAgent, /Edg\//)
  assert.equal(chrome.secChUa, '"Chromium";v="154", "Google Chrome";v="154", "Not-A.Brand";v="24"')

  const edge = buildChromiumIdentity('edge', '154.0.1807.56')
  assert.match(edge.userAgent, /Chrome\/154\.0\.0\.0 Safari\/537\.36 Edg\/154\.0\.1807\.56$/)
  assert.equal(edge.secChUa, '"Chromium";v="154", "Microsoft Edge";v="154", "Not-A.Brand";v="24"')
})

test('configureFingerprint applies detected overrides to later requests', () => {
  configureFingerprint({
    userAgent: 'UA-TEST',
    secChUa: '',
    locale: 'uk_UA',
    acceptLanguage: 'uk-UA,uk;q=0.9',
  })

  const headers = deepSeekBrowserHeaders()
  assert.equal(headers['User-Agent'], 'UA-TEST')
  assert.equal(headers['X-Client-Locale'], 'uk_UA')
  assert.equal(headers['Accept-Language'], 'uk-UA,uk;q=0.9')

  // Browsers without client hints (Firefox) must not send sec-ch-ua at all.
  assert.equal(headers['Sec-Ch-Ua'], undefined)
  assert.equal(headers['Sec-Ch-Ua-Platform'], undefined)

  // Non-overridden fields keep their defaults.
  assert.equal(headers['X-App-Version'], '2.0.0')
  assert.equal(headers['Origin'], 'https://chat.deepseek.com')

  assert.equal(getBrowserFingerprint().userAgent, 'UA-TEST')
})
