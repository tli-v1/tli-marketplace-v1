import React, { useEffect, useMemo, useState } from 'react'
import { getAgreementSignedUrl } from '../api/agreements'

const LawyerClientAgreement = ({ caseId, existingAgreement, agreementState, onSubmitAgreement }) => {
  const [agreementFile, setAgreementFile] = useState(null)
  const [message, setMessage] = useState('')
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState('')
  const [viewUrl, setViewUrl] = useState('')

  useEffect(() => {
    setAgreementFile(null)
    setMessage(existingAgreement?.message || '')
    setViewLoading(false)
    setViewError('')
    setViewUrl('')
  }, [existingAgreement, caseId])

  const agreementMessage = existingAgreement?.files?.length
    ? 'Existing Agreement Uploaded'
    : 'Upload a signed lawyer-client agreement to share with the client.'

  const latestFile = useMemo(() => {
    const files = existingAgreement?.files || []
    if (!files.length) return null
    return files[files.length - 1]
  }, [existingAgreement?.files])

  const handleSubmit = () => onSubmitAgreement?.({ caseId, file: agreementFile, message })

  const handleViewAgreement = async () => {
    if (viewUrl) {
      window.open(viewUrl, '_blank', 'noreferrer')
      return
    }

    if (!latestFile) {
      setViewError('No agreement uploaded yet.')
      return
    }

    setViewLoading(true)
    setViewError('')
    const signedUrl = await getAgreementSignedUrl(latestFile)
    setViewLoading(false)

    if (!signedUrl) {
      setViewError('Unable to load agreement.')
      return
    }

    setViewUrl(signedUrl)
    window.open(signedUrl, '_blank', 'noreferrer')
  }

  return (
    <div className="agreement-box">
      <div className="form-stack">
        <label className="input-label">
          <span>Upload your Lawyer-Client Agreement file (PDF)</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setAgreementFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="input-label">
          <span>Message to client</span>
          <textarea
            rows={3}
            placeholder="Add a short note to accompany the agreement…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
      </div>

      <div className="agreement-actions">
        <button type="button" className="secondary-btn" onClick={handleViewAgreement} disabled={viewLoading}>
          {viewLoading ? 'Loading…' : 'View'}
        </button>
        <button
          type="button"
          className="primary-btn"
          onClick={handleSubmit}
          disabled={agreementState.loading || !agreementFile}
        >
          {agreementState.loading ? 'Uploading…' : existingAgreement ? 'Update' : 'Upload'}
        </button>
      </div>

      <div className="bid-message">{viewError || agreementState.message || agreementMessage}</div>
    </div>
  )
}

export default LawyerClientAgreement
