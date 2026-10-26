const INVALID_CREDENTIAL_CODES = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/user-not-found',
  'auth/wrong-password',
])

// The current Firebase Auth SDK normally omits retry timing. Honor explicit
// timing if provided by the error or an HTTP adapter; never invent a cooldown.
export const getRetryDelayMs = (error, now = Date.now()) => {
  const value = error?.customData?.retryAfter ?? error?.retryAfter
    ?? error?.response?.headers?.get?.('Retry-After')
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds > 0 ? Math.ceil(seconds * 1000) : null
  const deadline = Date.parse(value)
  return Number.isFinite(deadline) && deadline > now ? deadline - now : null
}

export const toAuthError = (error, fallbackMessage = 'Authentication failed') => {
  if (error?.code === 'auth/too-many-requests') {
    const retryAfterMs = getRetryDelayMs(error)
    return {
      code: error.code,
      message: retryAfterMs
        ? `Too many attempts. Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before trying again.`
        : 'Too many attempts. Please wait before trying again. Firebase has not provided a retry time.',
      retryAfterMs,
    }
  }
  return { message: error?.message || fallbackMessage, code: error?.code }
}

export const toSignInError = (error) => INVALID_CREDENTIAL_CODES.has(error?.code)
  ? { message: 'Invalid username or password', code: error.code }
  : toAuthError(error, 'Unable to sign in. Please try again.')

export const formatRetryCountdown = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
