export const fetchMyAgreements = (lawyerId) =>
  Promise.resolve({ data: [], error: null })

export const submitAgreement = async ({ caseId, lawyerId, file, message }) => {
  if (!file) {
    return { error: { message: 'File is required' } }
  }
  return { data: null, error: null }
}

export const getAgreementSignedUrl = async (file) => {
  return null
}
