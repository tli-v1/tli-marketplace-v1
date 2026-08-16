import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getBlob, ref } from 'firebase/storage'
import { adminDeleteCase, getLawyerCases } from '@dataconnect/generated'
import { db, functions, storage } from '../firebase'

const VIEW_FILE_TIMEOUT_MS = 20000

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('File load timed out')), ms)
    }),
  ])

const normalizeDataConnectCase = (item) => {
  const incident = (item.lawyerCaseIncidents || item.caseDetailIncidents || item.incidents_on_case)?.[0] || {}
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
      location_details: incident.locationDetails,
      state_code: incident.stateCode,
      incident_date: incident.incidentDate,
      description: incident.description,
      created_at: incident.createdAt,
    },
    damages: damage
      ? [
          {
            case_id: damage.caseId,
            injuries: damage.injuries,
            treatment: damage.treatment,
            medical_bills_usd: damage.medicalBillsUsd,
            property_damage_usd: damage.propertyDamageUsd,
            other_expenses_usd: damage.otherExpensesUsd,
            days_missed: damage.daysMissed,
            hourly_rate_usd: damage.hourlyRateUsd,
            lost_wages_usd: damage.lostWagesUsd,
            emotional_impact: damage.emotionalImpact,
            other_damages: damage.otherDamages,
            details: damage.details,
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
    documents: (item.lawyerCaseDocuments || item.caseDetailDocuments || item.documents_on_case || []).map((doc) => ({
      id: doc.id,
      case_id: doc.caseId,
      kind: doc.kind,
      original_filename: doc.originalFilename,
      storage_path: doc.storagePath,
      uploaded_by: doc.uploadedBy,
      uploaded_at: doc.uploadedAt,
      notes: doc.notes,
    })),
    agreements: (item.lawyerCaseAgreements || item.caseDetailAgreements || item.lawyerClientAgreements_on_case || []).map(
      (agreement) => ({
        id: agreement.id,
        case_id: agreement.caseId,
        lawyer_id: agreement.lawyerId,
        message: agreement.message,
        created_at: agreement.createdAt,
        updated_at: agreement.updatedAt,
        files: (agreement.lawyerAgreementFiles || agreement.caseDetailAgreementFiles || agreement.lawyerClientAgreementFiles_on_agreement || []).map((file) => ({
          id: file.id,
          agreement_id: file.agreementId,
          file_name: file.fileName,
          storage_path: file.storagePath,
          public_url: file.publicUrl,
          content_type: file.contentType,
          size: file.fileSize,
          created_at: file.createdAt,
        })),
      }),
    ),
  }
}

export const getCaseDocSignedUrl = async (doc) => {
  const path = doc?.storage_path || doc?.path || doc?.fullPath
  if (!path) return { url: null, error: 'Missing storage path.' }

  try {
    const blob = await withTimeout(getBlob(ref(storage, path)), VIEW_FILE_TIMEOUT_MS)
    return { url: URL.createObjectURL(blob), error: null }
  } catch (error) {
    console.error('Get case document URL error', error)
    return { url: null, error: error?.message || 'Unable to load file.' }
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

const getStoragePath = (item) => item?.storage_path || item?.storagePath || item?.path || ''

const collectCaseStoragePaths = (caseRow) => {
  const documents = Array.isArray(caseRow?.documents) ? caseRow.documents : []
  const agreements = Array.isArray(caseRow?.agreements) ? caseRow.agreements : []
  const agreementFiles = agreements.flatMap((agreement) => (Array.isArray(agreement.files) ? agreement.files : []))

  return [...new Set([...documents, ...agreementFiles].map(getStoragePath).filter(Boolean))]
}

export const deleteCaseAsAdmin = async (caseOrId) => {
  const caseId = typeof caseOrId === 'string' ? caseOrId : caseOrId?.id
  const storagePaths = typeof caseOrId === 'string' ? [] : collectCaseStoragePaths(caseOrId)

  try {
    await adminDeleteCase({ caseId })
  } catch (error) {
    return {
      data: null,
      error: {
        message: error?.message || 'Failed to delete case',
        code: error?.code,
      },
    }
  }

  if (!storagePaths.length) {
    return { data: { caseDeleted: true, deletedFileCount: 0 }, error: null }
  }

  try {
    const callable = httpsCallable(functions, 'deleteCaseStorageFiles')
    const result = await callable({ caseId, storagePaths })
    return {
      data: {
        caseDeleted: true,
        deletedFileCount: result.data?.deletedCount || 0,
        deletedPaths: result.data?.deletedPaths || [],
      },
      error: null,
    }
  } catch (error) {
    return {
      data: { caseDeleted: true, deletedFileCount: 0 },
      error: {
        message: error?.message || 'Case deleted, but failed to delete one or more storage files',
        code: error?.code,
      },
    }
  }
}

export const enqueueNewCaseNotification = async ({ caseId, title = '', description = '', stateCode = '', source = 'case-created' }) => {
  if (!caseId) {
    return { data: null, error: { message: 'Missing case id' } }
  }

  try {
    const callable = httpsCallable(functions, 'enqueueMarketplaceCaseNotification')
    const result = await callable({ caseId, title, description, stateCode, source })
    return { data: result.data, error: null }
  } catch (error) {
    return {
      data: null,
      error: {
        message: error?.message || 'Failed to queue new case notification',
        code: error?.code,
      },
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
