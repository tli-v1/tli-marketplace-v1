import assert from 'node:assert/strict'
import test from 'node:test'
import { getRetryDelayMs, toSignInError, formatRetryCountdown } from '../../src/api/authErrors.js'

test('rate limiting without timing gives wait instructions without a fabricated timer', () => {
  const error = toSignInError({ code: 'auth/too-many-requests' })
  assert.match(error.message, /Please wait before trying again/)
  assert.equal(error.retryAfterMs, null)
})
test('explicit retry seconds and Retry-After dates produce countdown durations', () => {
  assert.equal(toSignInError({ code: 'auth/too-many-requests', customData: { retryAfter: 90 } }).retryAfterMs, 90000)
  assert.equal(getRetryDelayMs({ response: { headers: new Headers({ 'Retry-After': '30' }) } }), 30000)
  const now = Date.parse('2026-10-24T21:00:00Z')
  assert.equal(getRetryDelayMs({ retryAfter: 'Sat, 24 Oct 2026 21:01:00 GMT' }, now), 60000)
  assert.equal(formatRetryCountdown(90), '1:30')
})
test('invalid or expired retry metadata does not start a timer', () => {
  for (const retryAfter of ['', 0, -1, 'bad', false, 'Thu, 01 Jan 1970 00:00:00 GMT']) {
    assert.equal(getRetryDelayMs({ retryAfter }), null)
  }
})
test('invalid credentials retain their friendly message', () => {
  assert.equal(toSignInError({ code: 'auth/invalid-credential' }).message, 'Invalid username or password')
})
