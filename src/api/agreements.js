import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase'

const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

export const fetchMyAgreements = async (lawyerId) => {
  if (!lawyerId) return { data: [], error: null }

  try {
    const snapshot = await getDocs(
      query(collection(db, 'agreements'), where('lawyer_id', '==', lawyerId)),
    )
    const data = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() || new Date(a.created_at || 0).getTime()
        const bTime = b.created_at?.toMillis?.() || new Date(b.created_at || 0).getTime()
        return bTime - aTime
      })
    return { data, error: null }
  } catch (error) {
    return {
      data: [],
      error: { message: error?.message || 'Failed to fetch agreements', code: error?.code },
    }
  }
}

export const submitAgreement = async ({ caseId, lawyerId, file, message }) => {
  if (!file) {
    return { error: { message: 'File is required' } }
  }

  try {
    const storagePath = `agreements/${lawyerId}/${caseId}/${Date.now()}-${safeFileName(file.name)}`
    const fileRef = ref(storage, storagePath)
    await uploadBytes(fileRef, file, { contentType: file.type || 'application/pdf' })
    const publicUrl = await getDownloadURL(fileRef)
    const fileRecord = {
      file_name: file.name,
      storage_path: storagePath,
      public_url: publicUrl,
      content_type: file.type || 'application/pdf',
      size: file.size,
    }
    const agreement = {
      case_id: caseId,
      lawyer_id: lawyerId,
      message: message || '',
      files: [fileRecord],
      created_at: serverTimestamp(),
    }
    const docRef = await addDoc(collection(db, 'agreements'), agreement)

    return { data: { agreementId: docRef.id, publicUrl, file: fileRecord }, error: null }
  } catch (error) {
    return {
      data: null,
      error: { message: error?.message || 'Failed to upload agreement', code: error?.code },
    }
  }
}

export const getAgreementSignedUrl = async (file) => {
  const existingUrl = file?.signed_url || file?.signedUrl || file?.public_url || file?.file_url || file?.url
  if (existingUrl) return existingUrl

  const path = file?.storage_path || file?.path || file?.fullPath
  if (!path) return null

  try {
    return await getDownloadURL(ref(storage, path))
  } catch (error) {
    console.error('Get agreement URL error', error)
    return null
  }
}
