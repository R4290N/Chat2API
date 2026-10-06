import test from 'node:test'
import assert from 'node:assert/strict'

import { withAuthorizationFromCredentials } from '../../src/main/proxy/utils/headers.ts'

test('explicit Authorization header is kept and credentials do not overwrite it', () => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer fixed-provider-key',
  }
  const credentials = { token: 'account-token' }

  const result = withAuthorizationFromCredentials(headers, credentials)

  assert.equal(result.Authorization, 'Bearer fixed-provider-key')
})

test('lowercase authorization header counts as explicit too', () => {
  const headers = { authorization: 'Bearer fixed-provider-key' }

  const result = withAuthorizationFromCredentials(headers, { token: 'account-token' })

  assert.equal(result.authorization, 'Bearer fixed-provider-key')
  assert.equal(result.Authorization, undefined)
})

test('credentials fill Authorization when the provider does not set one', () => {
  const headers = { 'Content-Type': 'application/json' }

  assert.equal(
    withAuthorizationFromCredentials(headers, { token: 'account-token' }).Authorization,
    'Bearer account-token'
  )
  assert.equal(
    withAuthorizationFromCredentials(headers, { apiKey: 'api-key' }).Authorization,
    'Bearer api-key'
  )
  assert.equal(
    withAuthorizationFromCredentials(headers, { accessToken: 'access-token' }).Authorization,
    'Bearer access-token'
  )
  assert.equal(
    withAuthorizationFromCredentials(headers, { refreshToken: 'refresh-token' }).Authorization,
    'Bearer refresh-token'
  )
})

test('token wins when several credential fields are present', () => {
  const result = withAuthorizationFromCredentials({}, { token: 'token', apiKey: 'api-key' })

  assert.equal(result.Authorization, 'Bearer token')
})

test('no Authorization header when there is nothing to fill it with', () => {
  const result = withAuthorizationFromCredentials({ 'Content-Type': 'application/json' }, {})

  assert.equal(result.Authorization, undefined)
})

test('adding Authorization does not mutate the input headers', () => {
  const headers = { 'Content-Type': 'application/json' }

  withAuthorizationFromCredentials(headers, { token: 'account-token' })

  assert.equal(headers.Authorization, undefined)
})
