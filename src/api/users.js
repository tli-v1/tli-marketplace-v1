import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getLawyerUserProfile, getUserProfile, upsertLawyerUserProfile } from '@dataconnect/generated'
import { db } from '../firebase'

export const defaultNotificationPreferences = {
  emailNewCases: false,
  smsNewCases: false,
  alertCadence: 'daily',
}

const validAlertCadences = ['immediate', 'daily', 'weekly']

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
          alertCadence: profile.alertTimeframe?.toLowerCase?.() === 'weekly' ? 'weekly' : 'daily',
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
    if (['daily', 'weekly'].includes(normalized.alertCadence)) {
      await upsertLawyerUserProfile({
        emailNewCases: normalized.emailNewCases,
        smsNewCases: normalized.smsNewCases,
        alertTimeframe: normalized.alertCadence.toUpperCase(),
      })
    }

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
