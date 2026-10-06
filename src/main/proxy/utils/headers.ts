/**
 * Shared request header utilities
 */

/**
 * Check whether a header map already defines an Authorization header.
 * Header names are case-insensitive in HTTP, so `authorization` counts too.
 */
export function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
}

/**
 * Fill the Authorization header from account credentials.
 *
 * An explicitly configured Authorization header (e.g. a custom provider with a
 * fixed API key in `provider.headers`) always wins. Credentials are only used
 * when the provider does not define the header itself.
 *
 * Returns a new object; the input is never mutated.
 */
export function withAuthorizationFromCredentials(
  headers: Record<string, string>,
  credentials: Record<string, string>
): Record<string, string> {
  if (hasAuthorizationHeader(headers)) {
    return headers
  }

  if (credentials.token) {
    return { ...headers, Authorization: `Bearer ${credentials.token}` }
  }

  if (credentials.apiKey) {
    return { ...headers, Authorization: `Bearer ${credentials.apiKey}` }
  }

  if (credentials.accessToken) {
    return { ...headers, Authorization: `Bearer ${credentials.accessToken}` }
  }

  if (credentials.refreshToken) {
    return { ...headers, Authorization: `Bearer ${credentials.refreshToken}` }
  }

  return headers
}
