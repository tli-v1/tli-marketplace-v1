import { doc, getDoc } from 'firebase/firestore'
import { getUserProfile } from '@dataconnect/generated'
import { db } from '../firebase'

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
