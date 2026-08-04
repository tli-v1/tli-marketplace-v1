import process from 'node:process'
import { initializeApp, getApps } from 'firebase/app'
import {
  GoodStandingAnswer,
  addLawFirmApplicationCasePreference,
  addLawFirmApplicationPracticeArea,
  addLawFirmApplicationState,
  createLawFirmApplication,
} from '@dataconnect/generated'

const firebaseConfig = {
  apiKey: 'AIzaSyCboCSoLd7LM3v0pe5p2lf2qljUvNbd6Kk',
  authDomain: 'peak-bit-486121-n6.firebaseapp.com',
  projectId: 'peak-bit-486121-n6',
  storageBucket: 'peak-bit-486121-n6.firebasestorage.app',
  messagingSenderId: '207278105140',
  appId: '1:207278105140:web:38ef0959cb115cc24f2061',
}

const isEmulatorRun = Boolean(process.env.FIREBASE_DATACONNECT_EMULATOR_HOST)
const allowProdWrite = process.env.ALLOW_PROD_APPLICATION_TEST_WRITE === '1'

if (!isEmulatorRun && !allowProdWrite) {
  console.error(
    [
      'Refusing to write integration test data to production.',
      'Set ALLOW_PROD_APPLICATION_TEST_WRITE=1 to create a real test application row.',
      'If you are using the Data Connect emulator, set FIREBASE_DATACONNECT_EMULATOR_HOST.',
    ].join('\n'),
  )
  process.exit(1)
}

if (!getApps().length) {
  initializeApp(firebaseConfig)
}

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const errorMessage = (error) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const expectReject = async (label, action) => {
  try {
    await action()
  } catch (error) {
    console.log(`ok - ${label} rejected: ${errorMessage(error)}`)
    return
  }

  throw new Error(`${label} unexpectedly succeeded`)
}

const timestamp = Date.now()

const validApplication = {
  lawFirmName: `TLI Integration Test Firm ${timestamp}`,
  primaryContactName: 'Integration Test',
  email: `integration-test+${timestamp}@truelegalinnovations.com`,
  phone: '555-0100',
  website: 'https://example.com',
  numberOfAttorneys: 3,
  monthlyCaseCapacity: 8,
  googleBusinessProfileUrl: 'https://maps.google.com/?cid=123456789',
  googleRating: 4.7,
  approximateClientsServed: 250,
  clientServiceYears: 12,
  marketplaceFit: 'We handle screened injury cases quickly and have capacity for both routine and trucking claims.',
  attorneysGoodStanding: GoodStandingAnswer.YES,
  goodStandingExplanation: null,
}

const getInsertedId = (result, key) => result?.data?.[key]?.id

const runValidApplicationPath = async () => {
  const applicationResult = await createLawFirmApplication(validApplication)
  const applicationId = getInsertedId(applicationResult, 'lawFirmApplication_insert')

  assert(applicationId, 'CreateLawFirmApplication did not return an application id')

  const [stateResult, practiceResult, preferenceResult] = await Promise.all([
    addLawFirmApplicationState({ applicationId, stateCode: 'MO' }),
    addLawFirmApplicationPracticeArea({ applicationId, name: 'Trucking / commercial vehicle claims' }),
    addLawFirmApplicationCasePreference({ applicationId, name: 'Volume firm for routine injury claims' }),
  ])

  assert(getInsertedId(stateResult, 'lawFirmApplicationState_insert'), 'state child row was not created')
  assert(
    getInsertedId(practiceResult, 'lawFirmApplicationPracticeArea_insert'),
    'practice-area child row was not created',
  )
  assert(
    getInsertedId(preferenceResult, 'lawFirmApplicationCasePreference_insert'),
    'case-preference child row was not created',
  )

  console.log(`ok - valid application created: ${applicationId}`)
  return applicationId
}

const runRejectedPathChecks = async (applicationId) => {
  await expectReject('missing required law firm name', () =>
    createLawFirmApplication({
      ...validApplication,
      lawFirmName: undefined,
      email: `missing-name+${timestamp}@truelegalinnovations.com`,
    }),
  )

  await expectReject('invalid good-standing enum', () =>
    createLawFirmApplication({
      ...validApplication,
      email: `bad-enum+${timestamp}@truelegalinnovations.com`,
      attorneysGoodStanding: 'MAYBE',
    }),
  )

  await expectReject('malformed application UUID in practice-area child row', () =>
    addLawFirmApplicationPracticeArea({
      applicationId: 'not-a-uuid',
      name: 'Injected practice area',
    }),
  )

  await expectReject('invalid state code foreign key', () =>
    addLawFirmApplicationState({
      applicationId,
      stateCode: 'ZZZ',
    }),
  )
}

try {
  console.log(isEmulatorRun ? 'Running against Data Connect emulator.' : 'Running against production Data Connect.')
  const applicationId = await runValidApplicationPath()
  await runRejectedPathChecks(applicationId)
  console.log('Law firm application integration test passed.')
} catch (error) {
  console.error(`Law firm application integration test failed: ${errorMessage(error)}`)
  process.exit(1)
}
