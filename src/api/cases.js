import { collection, getDocs } from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import { getLawyerCases } from '@dataconnect/generated'
import { db, storage } from '../firebase'

const normalizeDataConnectCase = (item) => {
  const incident = item.incidents_on_case?.[0] || {}
  const damage = item.damage_on_case
  const contact = item.caseContact_on_case

  return {
    id: item.id,
    user_id: item.userId,
    status: item.status?.toLowerCase?.() || item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    incidents: {
      id: incident.id,
      case_id: incident.caseId,
      city: incident.city,
      state_code: incident.stateCode,
      incident_date: incident.incidentDate,
      description: incident.description,
      created_at: incident.createdAt,
    },
    damages: damage
      ? [
          {
            case_id: damage.caseId,
            medical_bills_usd: damage.medicalBillsUsd,
            days_missed: damage.daysMissed,
            daily_rate_usd: damage.dailyRateUsd,
            lost_wages_usd: damage.lostWagesUsd,
          },
        ]
      : [],
    case_contact: contact
      ? [
          {
            case_id: contact.caseId,
            full_name: contact.fullName,
            method: contact.method,
            email: contact.email,
            phone: contact.phone,
          },
        ]
      : [],
    parties: (item.parties_on_case || []).map((party) => ({
      id: party.id,
      case_id: party.caseId,
      role: party.role,
      name: party.name,
      insurer: party.insurerName,
      insurer_name: party.insurerName,
      policy_number: party.policyNumber,
      claim_number: party.claimNumber,
      created_at: party.createdAt,
    })),
    documents: (item.documents_on_case || []).map((doc) => ({
      id: doc.id,
      case_id: doc.caseId,
      kind: doc.kind,
      original_filename: doc.originalFilename,
      storage_path: doc.storagePath,
      uploaded_by: doc.uploadedBy,
      uploaded_at: doc.uploadedAt,
      notes: doc.notes,
    })),
  }
}

export const getCaseDocSignedUrl = async (doc) => {
  const existingUrl = doc?.signed_url || doc?.signedUrl || doc?.public_url || doc?.file_url || doc?.url
  if (existingUrl) return existingUrl

  const path = doc?.storage_path || doc?.path || doc?.fullPath
  if (!path) return null

  try {
    return await getDownloadURL(ref(storage, path))
  } catch (error) {
    console.error('Get case document URL error', error)
    return null
  }
}

export const fetchCases = async () => {
  try {
    const result = await getLawyerCases()
    const data = (result.data?.cases || []).map((item) => normalizeDataConnectCase(item))
    return { data, error: null }
  } catch (error) {
    console.warn('SQL Connect cases fetch failed, falling back to Firestore', error)
    try {
      const snapshot = await getDocs(collection(db, 'cases'))
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      return { data, error: null }
    } catch (fallbackError) {
      return {
        data: [],
        error: {
          message: fallbackError?.message || error?.message || 'Failed to fetch cases',
          code: fallbackError?.code || error?.code,
        },
      }
    }
  }
}

export const fetchCasesFromFirestore = async () => {
  try {
    const snapshot = await getDocs(collection(db, 'cases'))
    const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    return { data, error: null }
  } catch (error) {
    return {
      data: [],
      error: { message: error?.message || 'Failed to fetch cases', code: error?.code },
    }
  }
}

export const hydrateCaseDocuments = async (caseRows = []) => {
  return caseRows
}
