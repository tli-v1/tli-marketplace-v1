import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../../src/api/users.js', import.meta.url), 'utf8')

function loadPreferences(overrides = {}) {
  const calls = []
  const context = vm.createContext({
    console,
    doc: (...parts) => parts,
    db: {},
    getDoc: async () => ({ exists: () => false }),
    getLawyerUserProfile: async () => ({ data: {} }),
    getUserProfile: async () => ({ data: {} }),
    ensureMarketplaceProfiles: async (data) => calls.push(['provision', data]),
    runTransaction: async (_db, callback) => callback({
      get: async () => ({ exists: () => false }),
      set: (...args) => calls.push(['mirror', ...args]),
    }),
    upsertLawyerUserProfile: async (data) => calls.push(['sql', data]),
    setDoc: async (...args) => calls.push(['firestore', ...args]),
    serverTimestamp: () => 'server-time',
    ...overrides,
  })
  vm.runInContext(source.replace(/^import .*\n/gm, '').replace(/^export /gm, '') +
    '\nglobalThis.api = { fetchNotificationPreferences, saveNotificationPreferences, ensureMarketplaceUserProfiles }', context)
  return { api: context.api, calls }
}

for (const cadence of ['immediate', 'daily', 'weekly']) {
  test(`${cadence} saves to SQL and the Firestore notification worker profile`, async () => {
    const { api, calls } = loadPreferences()
    const result = await api.saveNotificationPreferences('lawyer-1', {
      emailNewCases: true, smsNewCases: false, alertCadence: cadence,
    })
    assert.equal(result.error, null)
    assert.equal(calls[0][0], 'sql')
    assert.equal(calls[0][1].alertTimeframe, cadence.toUpperCase())
    assert.equal(calls[1][0], 'firestore')
    assert.equal(calls[1][2].alert_timeframe, cadence)
    assert.equal(calls[1][2].notification_preferences.email_new_cases, true)
  })
}

test('SQL fallback preserves IMMEDIATE', async () => {
  const { api } = loadPreferences({
    getLawyerUserProfile: async () => ({ data: { lawyerUserProfile: {
      emailNewCases: true, smsNewCases: false, alertTimeframe: 'IMMEDIATE',
    } } }),
  })
  const result = await api.fetchNotificationPreferences('lawyer-1')
  assert.equal(result.data.alertCadence, 'immediate')
  assert.equal(result.data.emailNewCases, true)
})

test('missing profiles return defaults', async () => {
  const { api } = loadPreferences()
  const result = await api.fetchNotificationPreferences('lawyer-1')
  assert.equal(result.error, null)
  assert.equal(result.data.alertCadence, 'daily')
})

test('SQL failures are reported without writing a mismatched worker profile', async () => {
  const { api, calls } = loadPreferences({
    upsertLawyerUserProfile: async () => { throw new Error('SQL unavailable') },
  })
  const result = await api.saveNotificationPreferences('lawyer-1', { alertCadence: 'immediate' })
  assert.equal(result.error.message, 'SQL unavailable')
  assert.equal(calls.length, 0)
})

const sqlProfile = { emailNewCases: true, smsNewCases: false, alertTimeframe: 'IMMEDIATE' }

test('provisioning migrates existing Firestore preferences into missing SQL profiles', async () => {
  const { api, calls } = loadPreferences({
    getDoc: async () => ({ exists: () => true, data: () => ({
      alert_timeframe: 'immediate',
      notification_preferences: { email_new_cases: true, sms_new_cases: false },
    }) }),
    getLawyerUserProfile: async () => ({ data: { lawyerUserProfile: sqlProfile } }),
    runTransaction: async (_db, callback) => callback({
      get: async () => ({ exists: () => true }),
      set: () => assert.fail('existing preferences must not be replaced'),
    }),
  })
  assert.equal((await api.ensureMarketplaceUserProfiles('lawyer-1')).error, null)
  assert.equal(calls[0][1].alertTimeframe, 'IMMEDIATE')
  assert.equal(calls[0][1].emailNewCases, true)
})

test('provisioning creates a missing notification worker mirror from SQL preferences', async () => {
  const { api, calls } = loadPreferences({
    getLawyerUserProfile: async () => ({ data: { lawyerUserProfile: sqlProfile } }),
  })
  const first = api.ensureMarketplaceUserProfiles('lawyer-1')
  const concurrent = api.ensureMarketplaceUserProfiles('lawyer-1')
  assert.equal(first, concurrent, 'concurrent effects must share provisioning')
  assert.equal((await first).error, null)
  assert.equal(calls.filter(([kind]) => kind === 'provision').length, 1)
  const mirror = calls.find(([kind]) => kind === 'mirror')[2]
  assert.equal(mirror.alert_timeframe, 'immediate')
  assert.equal(mirror.notification_preferences.email_new_cases, true)
})

test('failed provisioning reports an error and can be retried', async () => {
  let attempts = 0
  const { api } = loadPreferences({
    ensureMarketplaceProfiles: async () => {
      if (++attempts === 1) throw new Error('SQL unavailable')
    },
    getLawyerUserProfile: async () => ({ data: { lawyerUserProfile: sqlProfile } }),
  })
  assert.equal((await api.ensureMarketplaceUserProfiles('lawyer-1')).error.message, 'SQL unavailable')
  assert.equal((await api.ensureMarketplaceUserProfiles('lawyer-1')).error, null)
  assert.equal(attempts, 2)
})
