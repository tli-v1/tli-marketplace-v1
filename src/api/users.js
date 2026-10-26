import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { ensureMarketplaceProfiles, getLawyerUserProfile, getUserProfile, upsertLawyerUserProfile } from '@dataconnect/generated'
import { db } from '../firebase'

export const defaultNotificationPreferences = {
  emailNewCases: false,
  smsNewCases: false,
  alertCadence: 'daily',
}

const validAlertCadences = ['immediate', 'daily', 'weekly']

// Deduplicate concurrent effects without caching failures or blocking future repairs.
const provisioning = new Map()

export const ensureMarketplaceUserProfiles = (userId) => {
  if (!userId) return Promise.resolve({ error: { message: 'Missing user id' } })
  if (provisioning.has(userId)) return provisioning.get(userId)

  const pending = (async () => {
    try {
      const profileRef = doc(db, 'lawyer_user_profiles', userId)
      const snapshot = await getDoc(profileRef)
      const legacy = snapshot.exists() ? snapshot.data() : null
      // Migrate existing Firestore preferences only when the SQL profile is missing.
      await ensureMarketplaceProfiles({
        emailNewCases: Boolean(legacy?.notification_preferences?.email_new_cases),
        smsNewCases: Boolean(legacy?.notification_preferences?.sms_new_cases),
        alertTimeframe: validAlertCadences.includes(legacy?.alert_timeframe)
          ? legacy.alert_timeframe.toUpperCase()
          : 'DAILY',
      })
      const result = await getLawyerUserProfile()
      const profile = result.data?.lawyerUserProfile
      if (!profile) throw new Error('Lawyer profile was not created')

      // The notification worker needs this mirror. A transaction avoids replacing
      // preferences saved in another tab while provisioning was in progress.
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(profileRef)
        if (current.exists()) return
        transaction.set(profileRef, {
          lawyer_id: userId,
          notification_preferences: {
            email_new_cases: profile.emailNewCases,
            sms_new_cases: profile.smsNewCases,
          },
          alert_timeframe: profile.alertTimeframe.toLowerCase(),
          updated_at: serverTimestamp(),
        })
      })
      return { error: null }
    } catch (error) {
      return { error: {
        message: error?.message || 'Failed to create marketplace profiles',
        code: error?.code,
      } }
    }
  })().finally(() => provisioning.delete(userId))
  provisioning.set(userId, pending)
  return pending
}

export const fetchUserProfile = async (userId) => {
  if (!userId) return { data: null, error: null }

  try {
    const result = await getUserProfile()
    if (result.data?.userProfile) {
      return {
        data: {
          user_id: result.data.userProfile.userId,
          full_name: result.data.userProfile.fullName,
          phone: result.data.userProfile.phone,
          role: result.data.userProfile.role,
        },
        error: null,
      }
    }
  } catch (error) {
    console.warn('SQL Connect user profile fetch failed, falling back to Firestore', error)
  }

  try {
    const snapshot = await getDoc(doc(db, 'users', userId))
    return { data: snapshot.exists() ? snapshot.data() : null, error: null }
  } catch (error) {
    return {
      data: null,
      error: { message: error?.message || 'Failed to fetch user profile', code: error?.code },
    }
  }
}

export const fetchNotificationPreferences = async (userId) => {
  if (!userId) return { data: defaultNotificationPreferences, error: null }

  try {
    const snapshot = await getDoc(doc(db, 'lawyer_user_profiles', userId))
    const raw = snapshot.exists() ? snapshot.data() : null
    if (raw) {
      const notificationPreferences = raw?.notification_preferences || {}
      return {
        data: {
          ...defaultNotificationPreferences,
          emailNewCases: Boolean(notificationPreferences.email_new_cases),
          smsNewCases: Boolean(notificationPreferences.sms_new_cases),
          alertCadence: validAlertCadences.includes(raw?.alert_timeframe) ? raw.alert_timeframe : 'daily',
        },
        error: null,
      }
    }
  } catch (error) {
    console.warn('Firestore lawyer profile fetch failed, falling back to SQL Connect', error)
  }

  try {
    const result = await getLawyerUserProfile()
    const profile = result.data?.lawyerUserProfile
    if (profile) {
      return {
        data: {
          ...defaultNotificationPreferences,
          emailNewCases: Boolean(profile.emailNewCases),
          smsNewCases: Boolean(profile.smsNewCases),
          alertCadence: validAlertCadences.includes(profile.alertTimeframe?.toLowerCase?.())
            ? profile.alertTimeframe.toLowerCase()
            : 'daily',
        },
        error: null,
      }
    }
  } catch (error) {
    console.warn('SQL Connect lawyer profile fetch failed', error)
    return {
      data: defaultNotificationPreferences,
      error: {
        message: error?.message || 'Failed to fetch notification preferences',
        code: error?.code,
      },
    }
  }

  return { data: { ...defaultNotificationPreferences }, error: null }
}

export const saveNotificationPreferences = async (userId, preferences) => {
  if (!userId) {
    return { data: null, error: { message: 'Missing user id' } }
  }

  const normalized = {
    emailNewCases: Boolean(preferences.emailNewCases),
    smsNewCases: Boolean(preferences.smsNewCases),
    alertCadence: validAlertCadences.includes(preferences.alertCadence) ? preferences.alertCadence : 'daily',
  }

  try {
    await upsertLawyerUserProfile({
      emailNewCases: normalized.emailNewCases,
      smsNewCases: normalized.smsNewCases,
      alertTimeframe: normalized.alertCadence.toUpperCase(),
    })

    await setDoc(
      doc(db, 'lawyer_user_profiles', userId),
      {
        lawyer_id: userId,
        notification_preferences: {
          email_new_cases: normalized.emailNewCases,
          sms_new_cases: normalized.smsNewCases,
        },
        alert_timeframe: normalized.alertCadence,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    )
    return { data: normalized, error: null }
  } catch (error) {
    return {
      data: null,
      error: {
        message: error?.message || 'Failed to save notification preferences',
        code: error?.code,
      },
    }
  }
}
