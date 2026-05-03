import { collection, getDocs } from 'firebase/firestore'
import { getStateCodes } from '@dataconnect/generated'
import { db } from '../firebase'

export const fetchStateCodes = async () => {
  try {
    const result = await getStateCodes()
    const data = (result.data?.stateCodes || [])
      .map((item) => ({ id: item.code, ...item }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return { data, error: null }
  } catch (error) {
    console.warn('SQL Connect state codes fetch failed, falling back to Firestore', error)
    try {
      const snapshot = await getDocs(collection(db, 'state_codes'))
      const data = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      return { data, error: null }
    } catch (fallbackError) {
      return {
        data: [],
        error: {
          message: fallbackError?.message || error?.message || 'Failed to fetch state codes',
          code: fallbackError?.code || error?.code,
        },
      }
    }
  }
}
