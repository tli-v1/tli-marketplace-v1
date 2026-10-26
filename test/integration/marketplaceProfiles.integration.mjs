import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

if (!process.env.DATA_CONNECT_EMULATOR_HOST && !process.env.FIREBASE_DATACONNECT_EMULATOR_HOST) {
  throw new Error('Profile integration tests require the Data Connect emulator')
}
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getDataConnect } = require('firebase-admin/data-connect')
initializeApp({ projectId: 'peak-bit-486121-n6' })
const dc = getDataConnect({ serviceId: 'tli-web-v1', location: 'us-central1' })
const mutations = await readFile(new URL('../../dataconnect/example/mutations.gql', import.meta.url), 'utf8')
const queries = await readFile(new URL('../../dataconnect/example/queries.gql', import.meta.url), 'utf8')
const seed = { emailNewCases: true, smsNewCases: true, alertTimeframe: 'IMMEDIATE' }
const run = (operationName, claims, variables = seed) => dc.executeGraphql(mutations, {
  operationName, variables, impersonate: { authClaims: claims },
})
const read = (claims) => dc.executeGraphql(queries, {
  operationName: 'GetLawyerUserProfile', impersonate: { authClaims: claims },
})

for (const [label, claims] of Object.entries({
  lawyer: { role: 'lawyer' },
  admin: { role: 'admin' },
  owner: { role: 'lawyer', owner: true, admin: true },
  flagOnlyAdmin: { admin: true },
})) {
  const user = { sub: `profile-test-${label}`, ...claims }
  await run('EnsureMarketplaceProfiles', user)
  const first = (await read(user)).data.lawyerUserProfile
  assert.equal(first.lawyerId, user.sub)
  assert.equal(first.alertTimeframe, 'IMMEDIATE')
  assert.equal(first.emailNewCases, true)
  await run('EnsureMarketplaceProfiles', user, { emailNewCases: false, smsNewCases: false, alertTimeframe: 'DAILY' })
  const second = (await read(user)).data.lawyerUserProfile
  assert.deepEqual(second, first, 'repeated sign-in must preserve preferences and timestamps')
  const parent = await dc.executeGraphql(`query { userProfile(key: {userId: "${user.sub}"}) {role} }`)
  assert.equal(parent.data.userProfile.role, label === 'flagOnlyAdmin' ? 'admin' : label)
  console.log(`ok - ${label} provisions parent and lawyer profile idempotently`)
}
for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'ordinary-user', role: 'user' } }]) {
  await assert.rejects(dc.executeGraphql(mutations, { operationName: 'EnsureMarketplaceProfiles', variables: seed, impersonate }))
}
console.log('ok - unauthorized provisioning rejected')
