import assert from 'node:assert/strict'
import test from 'node:test'
import { toAuthError } from '../../src/api/authErrors.js'
import { createRequire } from 'node:module'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { getDataConnect, connectDataConnectEmulator, terminate as terminateDataConnect } from 'firebase/data-connect'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, terminate as terminateFirestore } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import {
  connectorConfig, ensureUserProfile, ensureMarketplaceProfiles, getUserProfile,
  createCase, createIncident, createDamages, createCaseContact, createParty,
  getCaseDetails, getLawyerCases, getStateCodes,
} from '@dataconnect/generated'

const live = process.env.RUN_LIVE_INTAKE_EMAIL === '1' || process.argv.includes('--live')
const projectId = 'peak-bit-486121-n6'
const emulatorHost = process.env.DATA_CONNECT_EMULATOR_HOST || process.env.FIREBASE_DATACONNECT_EMULATOR_HOST
if (!live && (!emulatorHost || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Run npm run test:integration:intake for isolated local testing, or npm run test:intake:email for a live email test.')
}
if (live && (emulatorHost || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)) {
  throw new Error('Live mode requires all Firebase emulator environment variables to be unset.')
}
if (live && (!process.env.MARKETPLACE_TEST_EMAIL || !process.env.MARKETPLACE_TEST_PASSWORD)) {
  throw new Error('Set MARKETPLACE_TEST_EMAIL and MARKETPLACE_TEST_PASSWORD in .env.test.local. This must be a marketplace account with Immediate email alerts enabled. Live mode creates a synthetic intake and sends real notifications to opted-in lawyers.')
}

const app = initializeApp({
  apiKey: 'AIzaSyCboCSoLd7LM3v0pe5p2lf2qljUvNbd6Kk',
  projectId,
  authDomain: `${projectId}.firebaseapp.com`,
  storageBucket: `${projectId}.firebasestorage.app`,
  appId: '1:207278105140:web:38ef0959cb115cc24f2061',
})
const auth = getAuth(app)
const dc = getDataConnect(app, connectorConfig)
const db = getFirestore(app)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const email = live ? process.env.MARKETPLACE_TEST_EMAIL : `intake-email-${runId}@example.invalid`
const password = live ? process.env.MARKETPLACE_TEST_PASSWORD : `Local-test-${runId}!`
let caseId
let localHandler
let adminFirestore
const capturedEmails = []
let smtpServer
let restoreTransport

// Firebase SDK transports may retain idle sockets after cleanup. The npm scripts
// use Node's test runner with --test-force-exit after this awaited test completes.
await test('complete intake creates an immediate email notification', { timeout: 150000 }, async () => {
  try {
    if (!live) {
      const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':')
      const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
      const [sqlHost, sqlPort] = emulatorHost.replace(/^https?:\/\//, '').split(':')
      connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true })
      connectFirestoreEmulator(db, firestoreHost, Number(firestorePort))
      connectDataConnectEmulator(dc, sqlHost, Number(sqlPort))

      // Run the real Nodemailer SMTP transport against a local capture server.
      // Only the transport destination is overridden; production stays on Gmail TLS.
      const require = createRequire(new URL('../../functions/package.json', import.meta.url))
      const { emailTransport } = await import('../../functions/email.js')
      const { SMTPServer } = createRequire(import.meta.url)('smtp-server')
      smtpServer = new SMTPServer({
        disabledCommands: ['AUTH', 'STARTTLS'],
        authOptional: true,
        onData(stream, session, callback) {
          let raw = ''
          stream.on('data', chunk => { raw += chunk.toString() })
          stream.on('error', callback)
          stream.on('end', () => {
            capturedEmails.push({ to: session.envelope.rcptTo[0].address, raw })
            callback()
          })
        },
      })
      await new Promise((resolve, reject) => {
        smtpServer.once('error', reject)
        smtpServer.listen(0, '127.0.0.1', resolve)
      })
      const createTransport = emailTransport.create
      emailTransport.create = options => createTransport({
        ...options, host: '127.0.0.1', port: smtpServer.server.address().port,
        secure: false, auth: undefined, ignoreTLS: true,
      })
      restoreTransport = () => { emailTransport.create = createTransport }
      process.env.GMAIL_APP_PASSWORD = 'local-captured-provider'
      process.env.GMAIL_USER = 'notifications@example.invalid'
      const backend = await import('../../functions/index.js')
      localHandler = backend.enqueueMarketplaceCaseNotification
      const { getAuth: getAdminAuth } = require('firebase-admin/auth')
      const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore')
      const { getDataConnect: getAdminDataConnect } = require('firebase-admin/data-connect')
      adminFirestore = getAdminFirestore()
      await createUserWithEmailAndPassword(auth, email, password)
      await getAdminAuth().setCustomUserClaims(auth.currentUser.uid, { role: 'lawyer' })
      await auth.currentUser.getIdToken(true)
      await getAdminDataConnect({ serviceId: 'tli-web-v1', location: 'us-central1' }).executeGraphql(`
        mutation { stateCode_upsert(data: { code: "MO", name: "Missouri", active: true }) }
      `)
      await ensureMarketplaceProfiles(dc, { emailNewCases: true, smsNewCases: false, alertTimeframe: 'IMMEDIATE' })
      // Use the browser SDK so the real Firestore profile rules are checked too.
      await setDoc(doc(db, 'lawyer_user_profiles', auth.currentUser.uid), {
        lawyer_id: auth.currentUser.uid,
        notification_preferences: { email_new_cases: true, sms_new_cases: false },
        alert_timeframe: 'immediate',
      })
    } else {
      await signInWithEmailAndPassword(auth, email, password)
    }

    const user = auth.currentUser
    const token = await user.getIdTokenResult(true)
    assert.ok(['lawyer', 'admin', 'owner'].includes(token.claims.role) || token.claims.admin || token.claims.owner,
      'The test account must have marketplace access. Sign in to the marketplace once to provision its profiles.')
    const workerProfile = (await getDoc(doc(db, 'lawyer_user_profiles', user.uid))).data()
    assert.equal(workerProfile?.alert_timeframe, 'immediate', 'Enable Immediate alerts in marketplace Settings before testing.')
    assert.equal(workerProfile?.notification_preferences?.email_new_cases, true, 'Enable email alerts in marketplace Settings before testing.')
    assert.ok(user.email, 'The signed-in Firebase account must have a destination email.')
    console.log(`Notification recipient: ${user.email}`)

    const parent = await getUserProfile(dc)
    if (!parent.data.userProfile) {
      await ensureUserProfile(dc, { fullName: 'Synthetic intake test account' })
    }
    const states = (await getStateCodes(dc)).data.stateCodes
    const state = states.find((item) => item.code === 'MO') || states[0]
    assert.ok(state, 'No active state codes exist. Seed reference data before running this test.')
    const city = state.code === 'MO' ? 'St. Louis' : 'Test city'
    const description = `[EMAIL TEST ${runId}] Synthetic intake: rear-ended while stopped at a traffic light. No real client or incident. Please disregard.`

    const created = await createCase(dc, { consentStore: true, consentContact: true })
    caseId = created.data.case_insert.id
    console.log(`Created synthetic case: ${caseId}`)
    // Keep local Postgres emulator transactions sequential.
    await createIncident(dc, {
        caseId, description, incidentDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        city, stateCode: state.code, locationDetails: 'Synthetic intersection for email integration testing',
      })
    await createDamages(dc, {
        caseId, injuries: 'Synthetic neck strain', treatment: 'Synthetic urgent care visit',
        medicalBillsUsd: 1200, propertyDamageUsd: 2500, daysMissed: 2, hourlyRateUsd: 25, lostWagesUsd: 400,
        details: 'Synthetic amounts only; no real claim.',
      })
    await createCaseContact(dc, { caseId, fullName: 'Synthetic Intake Test', method: 'EMAIL', email: 'synthetic-client@example.invalid' })
    await createParty(dc, { caseId, role: 'DEFENDANT', name: 'Synthetic adverse party' })
    const details = (await getCaseDetails(dc, { caseId })).data.case
    assert.equal(details.id, caseId)
    assert.equal(details.consentStore, true)
    assert.equal(details.consentContact, true)
    assert.equal(details.caseDetailIncidents[0].description, description)
    assert.equal(details.damage_on_case.medicalBillsUsd, 1200)
    assert.equal(details.caseContact_on_case.fullName, 'Synthetic Intake Test')
    assert.equal(details.parties_on_case.length, 1)
    assert.ok((await getLawyerCases(dc)).data.cases.some((item) => item.id === caseId), 'Intake must be visible to the marketplace.')
    console.log('PASS: complete intake persisted and is visible to lawyers')

    const payload = { caseId, title: `EMAIL TEST · ${city}, ${state.code}`, description, stateCode: state.code, source: 'tli-web-case-created' }
    if (!live) {
      // An unset provider must be recoverable without creating another intake.
      delete process.env.GMAIL_APP_PASSWORD
      const missingProvider = await localHandler.run({ data: payload, auth: { uid: user.uid, token: token.claims } })
      assert.equal(missingProvider.immediate.deliveryCount, 0)
      assert.equal(capturedEmails.length, 0)
      process.env.GMAIL_APP_PASSWORD = 'local-captured-provider'
    }
    const response = live
      ? (await httpsCallable(getFunctions(app, 'us-central1'), 'enqueueMarketplaceCaseNotification', { timeout: 120000 })(payload)).data
      : await localHandler.run({ data: payload, auth: { uid: user.uid, token: token.claims } })
    assert.equal(response.queued, true)
    assert.equal(response.caseId.replaceAll('-', ''), caseId.replaceAll('-', ''))
    const notificationCaseId = response.caseId
    assert.ok(response.immediate.profileCount > 0, 'No Immediate notification profiles were found.')
    if (!live && !response.immediate.deliveryCount) {
      const failed = await adminFirestore.collection('marketplace_notification_deliveries')
        .doc(`immediate_${notificationCaseId}_${user.uid}_email`).get()
      console.error('Local SMTP delivery failure:', failed.data()?.error)
    }
    assert.ok(response.immediate.deliveryCount > 0,
      `Intake was created but no email was sent: ${JSON.stringify(response.immediate)}. Check Gmail SMTP configuration and marketplace_notification_deliveries.`)

    if (!live) {
      assert.equal(capturedEmails.length, 1)
      assert.equal(capturedEmails[0].to, email)
      assert.ok(capturedEmails[0].raw.includes('EMAIL TEST'))
      const delivery = await adminFirestore.collection('marketplace_notification_deliveries')
        .doc(`immediate_${notificationCaseId}_${user.uid}_email`).get()
      assert.equal(delivery.data().status, 'sent')
      assert.ok(delivery.data().case_ids.includes(notificationCaseId))
      const repeated = await localHandler.run({ data: { ...payload, caseId: notificationCaseId }, auth: { uid: user.uid, token: token.claims } })
      assert.equal(repeated.immediate.deliveryCount, 0)
      assert.equal(capturedEmails.length, 1, 'Retrying the same case must not send another email')
      console.log('PASS: email content, recipient, delivery record and sequential retry deduplication verified locally')
    } else {
      console.log(`PASS: provider accepted ${response.immediate.deliveryCount} immediate email(s). Check ${user.email}, including spam. Provider acceptance is not proof of inbox receipt.`)
      console.log('Live notification counts are aggregate across opted-in profiles. If your inbox is empty, inspect your per-lawyer delivery record in Firebase.')
      console.log(`Delivery record for this account: marketplace_notification_deliveries/immediate_${notificationCaseId}_${user.uid}_email`)
      console.log(`Test case remains in the marketplace for inspection: ${caseId}. Delete it in Admin when finished.`)
    }
  } catch (error) {
    if (error.code === 'auth/too-many-requests') {
      throw new Error(toAuthError(error).message)
    }
    if (caseId) console.error(`Test case ${caseId} exists; notification may not have completed. Inspect it before rerunning.`)
    throw error
  } finally {
    restoreTransport?.()
    if (smtpServer) await new Promise(resolve => smtpServer.close(resolve))
    console.log('Closing test connections…')
    await terminateFirestore(db)
    await terminateDataConnect(dc)
    await deleteApp(app)
    if (adminFirestore) await adminFirestore.terminate()
    if (!live) {
      const require = createRequire(new URL('../../functions/package.json', import.meta.url))
      const { getApps, deleteApp: deleteAdminApp } = require('firebase-admin/app')
      await Promise.all(getApps().map(deleteAdminApp))
    }
    console.log('Test connections closed')
  }
})
