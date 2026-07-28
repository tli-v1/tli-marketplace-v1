import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export const submitLawFirmApplication = async (application) => {
  try {
    const docRef = await addDoc(collection(db, 'law_firm_applications'), {
      ...application,
      status: 'new',
      created_at: serverTimestamp(),
    })
    return { data: { id: docRef.id }, error: null }
  } catch (error) {
    return {
      data: null,
      error: {
        message: error?.message || 'Failed to submit application',
        code: error?.code,
      },
    }
  }
}
