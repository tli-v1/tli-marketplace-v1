import { sendEmailNotification } from './email.js'
import { normalizeCaseId } from './caseIds.js'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'

initializeApp()

const notificationSecrets = [defineSecret('GMAIL_APP_PASSWORD')]

const auth = getAuth()
const firestore = getFirestore()
const bucket = getStorage().bucket()
const MANAGEABLE_ROLES = new Set(['lawyer', 'admin', 'owner'])
const ROLE_OPTIONS = new Set(['lawyer', 'admin', 'owner', 'none'])
const DELETABLE_STORAGE_PREFIXES = [
  'case-docs/',
  'case-documents/',
  'case_documents/',
  'cases/',
  'agreements/',
]
const NOTIFICATION_EVENTS_COLLECTION = 'marketplace_case_notification_events'
const NOTIFICATION_DELIVERIES_COLLECTION = 'marketplace_notification_deliveries'
const CONVERSATIONAL_INTAKES_COLLECTION = 'conversationalIntakes'
const NOTIFICATION_LOOKBACK_DAYS = {
  daily: 1,
  weekly: 7,
}

const getRequestRole = (request) => {
  const role = request.auth?.token?.role || request.auth?.token?.app_metadata?.role
  if (request.auth?.token?.owner === true) return 'owner'
  if (role === 'owner') return 'owner'
  if (request.auth?.token?.admin === true || role === 'admin') return 'admin'
  return role || ''
}

const requireAdmin = (request) => {
  const requesterRole = getRequestRole(request)
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before managing marketplace users.')
  }
  if (!['admin', 'owner'].includes(requesterRole)) {
    throw new HttpsError('permission-denied', 'Only admins can manage marketplace user roles.')
  }
  return requesterRole
}

const getUserMarketplaceRole = (userRecord) => {
  if (userRecord.customClaims?.owner === true || userRecord.customClaims?.role === 'owner') {
    return 'owner'
  }
  if (userRecord.customClaims?.admin === true || userRecord.customClaims?.role === 'admin') {
    return 'admin'
  }
  return userRecord.customClaims?.role || ''
}

const serializeUser = (userRecord) => {
  const role = getUserMarketplaceRole(userRecord)
  return {
    uid: userRecord.uid,
    email: userRecord.email || '',
    displayName: userRecord.displayName || '',
    role,
    emailVerified: Boolean(userRecord.emailVerified),
    disabled: Boolean(userRecord.disabled),
    createdAt: userRecord.metadata.creationTime || '',
    lastSignInAt: userRecord.metadata.lastSignInTime || '',
  }
}

const toSafeAuthError = (error, fallbackMessage) => {
  const code = error?.code || error?.errorInfo?.code
  if (code === 'auth/user-not-found') {
    return new HttpsError('not-found', 'No Firebase Auth account exists for that email or uid.')
  }
  if (code === 'auth/invalid-email') {
    return new HttpsError('invalid-argument', 'Enter a valid email address.')
  }
  if (code === 'auth/insufficient-permission') {
    return new HttpsError(
      'failed-precondition',
      'Role management function is missing Firebase Auth Admin IAM permission.',
    )
  }

  return new HttpsError('internal', fallbackMessage)
}

const normalizeStoragePath = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed.includes('..')) return ''
  return trimmed
}

const isAllowedCaseStoragePath = (path, caseId) => {
  if (!path || !caseId) return false
  if (!DELETABLE_STORAGE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false
  return path.split('/').includes(caseId)
}

const normalizeString = (value, maxLength = 500) => {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

const serializeFirestoreValue = (value) => {
  if (value?.toDate) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeFirestoreValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeFirestoreValue(item)]))
  }
  return value ?? null
}

const requireSignedIn = (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before creating marketplace notifications.')
  }
  return request.auth.uid
}

const getPeriodKey = (cadence, now = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dateKey = formatter.format(now)
  if (cadence === 'daily') return dateKey

  const utcDay = now.getUTCDay()
  const daysSinceMonday = (utcDay + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday)
  return `week-${monday.toISOString().slice(0, 10)}`
}

const getEventCreatedMillis = (event) => {
  const createdAt = event.created_at || event.createdAt
  if (createdAt?.toMillis) return createdAt.toMillis()
  if (createdAt instanceof Date) return createdAt.getTime()
  return 0
}

const summarizeCaseForMessage = (event) => {
  const title = normalizeString(event.title || event.description || 'New marketplace case', 120)
  const state = normalizeString(event.state_code || event.stateCode || '', 12)
  return state ? `${title} (${state})` : title
}

const buildNotificationText = ({ cadence, cases }) => {
  const cadenceLabel = cadence === 'weekly' ? 'weekly' : cadence === 'immediate' ? 'new' : 'daily'
  const headline = `TLI Marketplace ${cadenceLabel} case alert`
  const lines = cases.slice(0, 8).map((event, index) => `${index + 1}. ${summarizeCaseForMessage(event)}`)
  const extra = cases.length > lines.length ? `\n+ ${cases.length - lines.length} more case(s)` : ''
  return `${headline}\n\n${cases.length} new marketplace case(s):\n${lines.join('\n')}${extra}\n\nSign in to review: https://www.marketplace.truelegalinnovations.com`
}

const firstPresent = (source, keys) => {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
      return source[key]
    }
  }
  return null
}

const toIsoDate = (value) => {
  if (!value) return ''
  if (value?.toDate) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
  return ''
}

const normalizeConversationMessages = (data) => {
  const source = firstPresent(data, ['messages', 'conversation', 'transcript', 'chat', 'turns', 'history'])
  if (!Array.isArray(source)) return []

  return source.slice(-80).map((message, index) => {
    if (typeof message === 'string') {
      return { index, role: '', content: message, createdAt: '' }
    }

    if (!message || typeof message !== 'object') {
      return { index, role: '', content: String(message ?? ''), createdAt: '' }
    }

    return {
      index,
      role: normalizeString(firstPresent(message, ['role', 'speaker', 'author', 'sender', 'type']) || '', 40),
      content: normalizeString(firstPresent(message, ['content', 'text', 'message', 'body', 'answer', 'value']) || '', 5000),
      createdAt: toIsoDate(firstPresent(message, ['created_at', 'createdAt', 'timestamp', 'time', 'sentAt'])),
    }
  })
}

const deriveIntakeStatus = (data) => {
  const rawStatus = normalizeString(firstPresent(data, ['status', 'state', 'stage', 'conversationStatus']) || '', 80)
  const lowerStatus = rawStatus.toLowerCase()
  const completed = Boolean(
    data.completed === true
      || data.isComplete === true
      || data.submitted === true
      || data.leadCreated === true
      || firstPresent(data, ['completed_at', 'completedAt', 'submitted_at', 'submittedAt', 'lead_id', 'leadId', 'case_id', 'caseId'])
      || ['complete', 'completed', 'submitted', 'converted', 'lead_created', 'case_created'].includes(lowerStatus),
  )

  return {
    status: rawStatus || (completed ? 'completed' : 'incomplete'),
    completed,
  }
}

const serializeConversationalIntake = (doc) => {
  const data = doc.data() || {}
  const createdAt = toIsoDate(firstPresent(data, ['created_at', 'createdAt', 'started_at', 'startedAt', 'created']))
  const updatedAt = toIsoDate(firstPresent(data, ['updated_at', 'updatedAt', 'last_message_at', 'lastMessageAt', 'lastSeenAt']))
  const completedAt = toIsoDate(firstPresent(data, ['completed_at', 'completedAt', 'submitted_at', 'submittedAt']))
  const timestamp = updatedAt || completedAt || createdAt
  const messages = normalizeConversationMessages(data)
  const { status, completed } = deriveIntakeStatus(data)

  return {
    id: doc.id,
    createdAt,
    updatedAt,
    completedAt,
    timestamp,
    status,
    completed,
    currentStep: normalizeString(firstPresent(data, ['current_step', 'currentStep', 'step', 'questionKey', 'lastQuestion']) || '', 160),
    failureReason: normalizeString(firstPresent(data, ['failure_reason', 'failureReason', 'error', 'errorMessage', 'dropoffReason']) || '', 500),
    contactName: normalizeString(firstPresent(data, ['full_name', 'fullName', 'name', 'contactName']) || '', 160),
    contactEmail: normalizeString(firstPresent(data, ['email', 'contactEmail']) || '', 180),
    contactPhone: normalizeString(firstPresent(data, ['phone', 'contactPhone']) || '', 80),
    caseId: normalizeString(firstPresent(data, ['case_id', 'caseId']) || '', 100),
    leadId: normalizeString(firstPresent(data, ['lead_id', 'leadId']) || '', 100),
    messageCount: messages.length,
    messages,
    raw: serializeFirestoreValue(data),
  }
}

const fetchConversationalIntakeDocs = async (limit) => {
  const collectionRef = firestore.collection(CONVERSATIONAL_INTAKES_COLLECTION)
  const orderFields = ['updated_at', 'updatedAt', 'created_at', 'createdAt', 'lastMessageAt']
  const docsById = new Map()

  for (const field of orderFields) {
    try {
      const snapshot = await collectionRef.orderBy(field, 'desc').limit(limit).get()
      snapshot.docs.forEach((doc) => docsById.set(doc.id, doc))
      if (docsById.size >= limit) break
    } catch (error) {
      console.warn(`Failed to order conversational intakes by ${field}`, error)
    }
  }

  if (!docsById.size) {
    const snapshot = await collectionRef.limit(limit).get()
    snapshot.docs.forEach((doc) => docsById.set(doc.id, doc))
  }

  return [...docsById.values()].slice(0, limit)
}

const getDeliveryId = ({ cadence, channel, periodKey, lawyerId }) => `${cadence}_${periodKey}_${lawyerId}_${channel}`

const sendSmsNotification = async ({ to, text }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_PHONE
  if (!accountSid || !authToken || !from) {
    return { status: 'missing_provider', provider: 'twilio' }
  }

  const body = new URLSearchParams({ To: to, From: from, Body: text.slice(0, 1500) })
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Twilio failed with ${response.status}: ${await response.text()}`)
  }

  return { status: 'sent', provider: 'twilio' }
}

const getRecentNotificationEvents = async (cadence) => {
  const days = NOTIFICATION_LOOKBACK_DAYS[cadence] || 1
  const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
  const snapshot = await firestore
    .collection(NOTIFICATION_EVENTS_COLLECTION)
    .where('created_at', '>=', since)
    .orderBy('created_at', 'desc')
    .limit(500)
    .get()

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => getEventCreatedMillis(a) - getEventCreatedMillis(b))
}

const getLawyerNotificationProfiles = async (cadence) => {
  const snapshot = await firestore.collection('lawyer_user_profiles').where('alert_timeframe', '==', cadence).get()
  return snapshot.docs
    .map((doc) => ({ lawyerId: doc.id, ...doc.data() }))
    .filter((profile) => {
      const preferences = profile.notification_preferences || {}
      return preferences.email_new_cases || preferences.sms_new_cases
    })
}

const writeDeliveryStatus = async ({ cadence, channel, periodKey, lawyerId, caseIds, status, provider, error }) => {
  const deliveryId = getDeliveryId({ cadence, channel, periodKey, lawyerId })
  await firestore.collection(NOTIFICATION_DELIVERIES_COLLECTION).doc(deliveryId).set(
    {
      cadence,
      channel,
      period_key: periodKey,
      lawyer_id: lawyerId,
      case_ids: caseIds,
      status,
      provider: provider || null,
      error: error || null,
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

const deliveryAlreadyHandled = async ({ cadence, channel, periodKey, lawyerId }) => {
  const delivery = await firestore
    .collection(NOTIFICATION_DELIVERIES_COLLECTION)
    .doc(getDeliveryId({ cadence, channel, periodKey, lawyerId }))
    .get()
  return delivery.data()?.status === 'sent'
}

const notifyProfile = async ({ profile, cadence, periodKey, cases, emailOnly = false }) => {
  let deliveryCount = 0
  let userRecord
  const caseIds = cases.map((event) => event.case_id || event.caseId || event.id).filter(Boolean)

  try {
    userRecord = await auth.getUser(profile.lawyerId)
  } catch (error) {
    await writeDeliveryStatus({
      cadence,
      channel: 'profile',
      periodKey,
      lawyerId: profile.lawyerId,
      caseIds,
      status: 'failed',
      error: error?.message || 'Unable to load lawyer auth profile.',
    })
    return 0
  }

  const preferences = profile.notification_preferences || {}
  const text = buildNotificationText({ cadence, cases })

  if (preferences.email_new_cases) {
    try {
      if (!(await deliveryAlreadyHandled({ cadence, channel: 'email', periodKey, lawyerId: profile.lawyerId }))) {
        const result = userRecord.email
          ? await sendEmailNotification({
              to: userRecord.email,
              subject: `TLI Marketplace: ${cases.length} new case(s)`,
              text,
            })
          : { status: 'missing_destination', provider: 'firebase-auth' }
        await writeDeliveryStatus({ cadence, channel: 'email', periodKey, lawyerId: profile.lawyerId, caseIds, ...result })
        if (result.status === 'sent') deliveryCount += 1
      }
    } catch (error) {
      await writeDeliveryStatus({
        cadence,
        channel: 'email',
        periodKey,
        lawyerId: profile.lawyerId,
        caseIds,
        status: 'failed',
        provider: 'gmail-smtp',
        error: error?.message || 'Email send failed.',
      })
    }
  }

  if (!emailOnly && preferences.sms_new_cases) {
    try {
      if (!(await deliveryAlreadyHandled({ cadence, channel: 'sms', periodKey, lawyerId: profile.lawyerId }))) {
        const result = userRecord.phoneNumber
          ? await sendSmsNotification({ to: userRecord.phoneNumber, text })
          : { status: 'missing_destination', provider: 'firebase-auth' }
        await writeDeliveryStatus({ cadence, channel: 'sms', periodKey, lawyerId: profile.lawyerId, caseIds, ...result })
        if (result.status === 'sent') deliveryCount += 1
      }
    } catch (error) {
      await writeDeliveryStatus({
        cadence,
        channel: 'sms',
        periodKey,
        lawyerId: profile.lawyerId,
        caseIds,
        status: 'failed',
        provider: 'twilio',
        error: error?.message || 'SMS send failed.',
      })
    }
  }

  return deliveryCount
}

const processMarketplaceNotifications = async (cadence) => {
  const [events, profiles] = await Promise.all([getRecentNotificationEvents(cadence), getLawyerNotificationProfiles(cadence)])
  const periodKey = getPeriodKey(cadence)

  if (!events.length || !profiles.length) {
    return { cadence, eventCount: events.length, profileCount: profiles.length, deliveryCount: 0 }
  }

  let deliveryCount = 0
  for (const profile of profiles) {
    deliveryCount += await notifyProfile({ profile, cadence, periodKey, cases: events })
  }

  return { cadence, eventCount: events.length, profileCount: profiles.length, deliveryCount }
}

const processImmediateMarketplaceNotification = async (event) => {
  const profiles = await getLawyerNotificationProfiles('immediate')
  const periodKey = event.case_id || event.caseId || event.id

  if (!profiles.length) {
    return { cadence: 'immediate', eventCount: 1, profileCount: 0, deliveryCount: 0 }
  }

  let deliveryCount = 0
  for (const profile of profiles) {
    deliveryCount += await notifyProfile({ profile, cadence: 'immediate', periodKey, cases: [event], emailOnly: true })
  }

  return { cadence: 'immediate', eventCount: 1, profileCount: profiles.length, deliveryCount }
}

export const listMarketplaceUsers = onCall({ region: 'us-central1' }, async (request) => {
  const requesterRole = requireAdmin(request)

  const users = []
  let pageToken

  try {
    do {
      const page = await auth.listUsers(1000, pageToken)
      page.users.forEach((userRecord) => {
        const role = getUserMarketplaceRole(userRecord)
        if (MANAGEABLE_ROLES.has(role)) {
          users.push(serializeUser(userRecord))
        }
      })
      pageToken = page.pageToken
    } while (pageToken)
  } catch (error) {
    throw toSafeAuthError(error, 'Failed to list marketplace users.')
  }

  users.sort((a, b) => {
    const roleCompare = a.role.localeCompare(b.role)
    if (roleCompare) return roleCompare
    return a.email.localeCompare(b.email)
  })

  return { users, requesterRole }
})

export const setMarketplaceUserRole = onCall({ region: 'us-central1' }, async (request) => {
  const requesterRole = requireAdmin(request)

  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : ''
  const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : ''
  const role = typeof request.data?.role === 'string' ? request.data.role.trim().toLowerCase() : ''

  if (!uid && !email) {
    throw new HttpsError('invalid-argument', 'Provide either a uid or email.')
  }
  if (!ROLE_OPTIONS.has(role)) {
    throw new HttpsError('invalid-argument', 'Role must be lawyer, admin, owner, or none.')
  }

  let userRecord
  try {
    userRecord = uid ? await auth.getUser(uid) : await auth.getUserByEmail(email)
  } catch (error) {
    throw toSafeAuthError(error, 'Failed to load the target Firebase Auth account.')
  }
  const currentRole = getUserMarketplaceRole(userRecord)
  const touchesElevatedRole = ['admin', 'owner'].includes(role) || ['admin', 'owner'].includes(currentRole)

  if (touchesElevatedRole && requesterRole !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owners can manage admin and owner accounts.')
  }

  const nextClaims = { ...(userRecord.customClaims || {}) }

  if (role === 'none') {
    delete nextClaims.role
    delete nextClaims.admin
    delete nextClaims.owner
  } else if (role === 'owner') {
    nextClaims.role = 'lawyer'
    nextClaims.admin = true
    nextClaims.owner = true
  } else if (role === 'admin') {
    nextClaims.role = 'lawyer'
    nextClaims.admin = true
    delete nextClaims.owner
  } else {
    nextClaims.role = role
    delete nextClaims.admin
    delete nextClaims.owner
  }

  try {
    await auth.setCustomUserClaims(userRecord.uid, nextClaims)
    await auth.revokeRefreshTokens(userRecord.uid)
  } catch (error) {
    throw toSafeAuthError(error, 'Failed to update Firebase Auth custom claims.')
  }

  let updated
  try {
    updated = await auth.getUser(userRecord.uid)
  } catch (error) {
    throw toSafeAuthError(error, 'Role changed, but failed to reload the updated user.')
  }
  return { user: serializeUser(updated) }
})

export const deleteCaseStorageFiles = onCall({ region: 'us-central1' }, async (request) => {
  requireAdmin(request)

  const caseId = typeof request.data?.caseId === 'string' ? request.data.caseId.trim() : ''
  const paths = Array.isArray(request.data?.storagePaths) ? request.data.storagePaths : []

  if (!caseId) {
    throw new HttpsError('invalid-argument', 'Missing case id.')
  }

  const requestedPaths = paths.map(normalizeStoragePath).filter(Boolean)
  const invalidPath = requestedPaths.find((path) => !isAllowedCaseStoragePath(path, caseId))
  if (invalidPath) {
    throw new HttpsError('invalid-argument', 'One or more storage paths are not valid for this case.')
  }
  const normalizedPaths = [...new Set(requestedPaths)]

  const results = await Promise.allSettled(
    normalizedPaths.map(async (path) => {
      try {
        await bucket.file(path).delete({ ignoreNotFound: true })
        return path
      } catch (error) {
        throw new Error(`${path}: ${error?.message || 'delete failed'}`)
      }
    }),
  )

  const failed = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message || 'Unknown storage delete failure')

  if (failed.length) {
    throw new HttpsError('internal', `Failed to delete ${failed.length} storage file(s).`, { failed })
  }

  return { deletedCount: normalizedPaths.length, deletedPaths: normalizedPaths }
})

export const listConversationalIntakes = onCall({ region: 'us-central1' }, async (request) => {
  requireAdmin(request)

  const requestedLimit = Number(request.data?.limit || 250)
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 250, 25), 500)

  try {
    const docs = await fetchConversationalIntakeDocs(limit)
    const intakes = docs
      .map(serializeConversationalIntake)
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())

    return { intakes }
  } catch (error) {
    console.error('Failed to list conversational intakes', error)
    throw new HttpsError('internal', 'Failed to load conversational intakes.')
  }
})

export const enqueueMarketplaceCaseNotification = onCall({ region: 'us-central1', secrets: notificationSecrets }, async (request) => {
  const uid = requireSignedIn(request)

  const caseId = normalizeCaseId(request.data?.caseId)
  if (!caseId) {
    throw new HttpsError('invalid-argument', 'Provide a valid case id.')
  }

  const payload = {
    case_id: caseId,
    created_by: uid,
    title: normalizeString(request.data?.title, 180),
    description: normalizeString(request.data?.description, 800),
    state_code: normalizeString(request.data?.stateCode, 12).toUpperCase(),
    status: 'queued',
    source: normalizeString(request.data?.source, 80) || 'case-created',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }

  await firestore.collection(NOTIFICATION_EVENTS_COLLECTION).doc(caseId).set(payload, { merge: true })
  const immediate = await processImmediateMarketplaceNotification({
    ...payload,
    case_id: caseId,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  })

  return { queued: true, caseId, immediate }
})

export const processDailyMarketplaceNotifications = onSchedule(
  {
    region: 'us-central1',
    secrets: notificationSecrets,
    schedule: '0 9 * * *',
    timeZone: 'America/New_York',
  },
  async () => processMarketplaceNotifications('daily'),
)

export const processWeeklyMarketplaceNotifications = onSchedule(
  {
    region: 'us-central1',
    secrets: notificationSecrets,
    schedule: '0 9 * * MON',
    timeZone: 'America/New_York',
  },
  async () => processMarketplaceNotifications('weekly'),
)
