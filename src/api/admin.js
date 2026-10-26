import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

const toAdminError = (error, fallbackMessage) => ({
  message: error?.message || fallbackMessage,
  code: error?.code,
})

export const fetchMarketplaceUsers = async () => {
  try {
    const callable = httpsCallable(functions, 'listMarketplaceUsers')
    const result = await callable()
    return {
      data: {
        users: result.data?.users || [],
        requesterRole: result.data?.requesterRole || '',
      },
      error: null,
    }
  } catch (error) {
    return {
      data: { users: [], requesterRole: '' },
      error: toAdminError(error, 'Failed to load marketplace users'),
    }
  }
}

export const updateMarketplaceUserRole = async ({ uid, email, role }) => {
  try {
    const callable = httpsCallable(functions, 'setMarketplaceUserRole')
    const result = await callable({ uid, email, role })
    return { data: result.data?.user || null, error: null }
  } catch (error) {
    return {
      data: null,
      error: toAdminError(error, 'Failed to update marketplace user role'),
    }
  }
}

export const fetchConversationalIntakes = async ({ limit = 250 } = {}) => {
  try {
    const callable = httpsCallable(functions, 'listConversationalIntakes')
    const result = await callable({ limit })
    return { data: result.data?.intakes || [], error: null }
  } catch (error) {
    return {
      data: [],
      error: toAdminError(error, 'Failed to load conversational intakes'),
    }
  }
}
