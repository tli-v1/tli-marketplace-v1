import React, { useEffect, useState } from 'react'
import { formatCurrency } from '../utils'
import { getCaseDocSignedUrl } from '../api/cases'
import LawyerClientAgreement from './LawyerClientAgreement'

const formatDate = (value) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleDateString()
}

const resolveDocName = (doc, idx) =>
  doc?.display_name ||
  doc?.original_filename ||
  doc?.filename ||
  doc?.file_name ||
  doc?.name ||
  doc?.title ||
  `File ${idx + 1}`

const formatRole = (value) =>
  (value || '')
    .toString()
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const hasText = (value) => Boolean(value?.toString?.().trim())

const writeFileWindowMessage = (targetWindow, title, message) => {
  if (!targetWindow?.document) return

  targetWindow.document.title = title
  targetWindow.document.body.innerHTML = `
    <main style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #0f2c4b;">
      <h1 style="font-size: 20px; margin: 0 0 8px;">${title}</h1>
      <p style="font-size: 15px; margin: 0; color: #4b5e72;">${message}</p>
    </main>
  `
}

const CaseDetail = ({
  data,
  onClose,
  onSubmitAgreement,
  existingAgreement,
  agreementState = { loading: false, message: '' },
}) => {
  const [docLinks, setDocLinks] = useState({})
  const [docLoading, setDocLoading] = useState({})
  const [docErrors, setDocErrors] = useState({})

  useEffect(() => {
    setDocLinks({})
    setDocLoading({})
    setDocErrors({})
  }, [existingAgreement, data?.id])

  if (!data) return null

  const documents = Array.isArray(data.documents) ? data.documents : []
  const parties = Array.isArray(data.parties) ? data.parties : []
  const locationLabel = `${data.incident.city}, ${data.displayState || data.incident.state}`
  const damageNarrative = [
    ['Injuries', data.damages.injuries],
    ['Treatment', data.damages.treatment],
    ['Emotional impact', data.damages.emotionalImpact],
    ['Other damages', data.damages.otherDamages],
    ['Damage details', data.damages.details],
  ].filter(([, value]) => hasText(value))

  const handleViewDocument = async (doc, key) => {
    const currentUrl = docLinks[key]
    if (currentUrl) {
      window.open(currentUrl, '_blank', 'noreferrer')
      return
    }

    const pendingWindow = window.open('about:blank', '_blank')
    writeFileWindowMessage(pendingWindow, 'Loading file', 'Checking access and preparing the document...')
    setDocLoading((prev) => ({ ...prev, [key]: true }))
    setDocErrors((prev) => ({ ...prev, [key]: '' }))
    const { url, error } = await getCaseDocSignedUrl(doc)
    setDocLoading((prev) => ({ ...prev, [key]: false }))

    if (!url) {
      writeFileWindowMessage(pendingWindow, 'Unable to load file', error || 'Unable to load file.')
      setDocErrors((prev) => ({ ...prev, [key]: error || 'Unable to load file.' }))
      return
    }

    setDocLinks((prev) => ({ ...prev, [key]: url }))
    if (pendingWindow) {
      pendingWindow.location.href = url
    } else {
      window.open(url, '_blank', 'noreferrer')
    }
  }

  return (
    <div className="case-modal-backdrop" onClick={onClose}>
      <div className="case-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" type="button" onClick={onClose} aria-label="Close case details">
          ×
        </button>

        <div className="detail-grid">
          <div className="detail-column">
            <section className="detail-section">
              <div className="section-head">
                <h4>Incident details</h4>
                <span className="section-sub">{locationLabel}</span>
              </div>
              <p className="section-body">{data.incident.description || 'No incident narrative provided.'}</p>
              <div className="detail-list">
                <DetailMeta label="Date" value={formatDate(data.incident.date)} />
                <DetailMeta label="Location details" value={data.incident.locationDetails} />
                <DetailMeta
                  label="Contact"
                  value={`${data.caseContact.fullName || '—'} • ${data.caseContact.method || '—'}`}
                />
                <DetailMeta label="Email" value={data.caseContact.email} />
                <DetailMeta label="Phone" value={data.caseContact.phone} />
                <DetailMeta label="Documents" value={`${documents.length}`} />
                <DetailMeta label="Value range" value={data.valueRange} />
              </div>
            </section>

            <section className="detail-section">
              <div className="section-head">
                <h4>Parties</h4>
                <span className="section-sub">Plaintiff / defendant / insurer</span>
              </div>
              {parties.length === 0 ? (
                <p className="section-body">No parties listed.</p>
              ) : (
                <ul className="detail-list stack">
                  {parties.map((party, idx) => (
                    <li key={party.id || idx}>
                      <div className="party-row-head">
                        <strong>{party.name || party.insurer || `Party ${idx + 1}`}</strong>
                        {party.role && <span className="party-role">{formatRole(party.role)}</span>}
                      </div>
                      <div className="party-fields">
                        <DetailMeta label="Insurer" value={party.insurer_name || party.insurer} />
                        <DetailMeta label="Policy" value={party.policy_number} />
                        <DetailMeta label="Claim" value={party.claim_number} />
                      </div>
                      {party.contact && <div className="party-note">{party.contact}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="detail-column">
            <section className="detail-section">
              <div className="section-head">
                <h4>Damages</h4>
                <span className="section-sub">Financial snapshot</span>
              </div>
              <div className="detail-list two-col">
                <DetailMeta label="Medical" value={formatCurrency(data.medicalDamageUsd)} />
                <DetailMeta label="Property damage" value={formatCurrency(data.propertyDamageUsd)} />
                <DetailMeta label="Other expenses" value={formatCurrency(data.otherExpensesUsd)} />
                <DetailMeta label="Lost wages" value={formatCurrency(data.lostWagesUsd)} />
                <DetailMeta label="Days missed" value={`${data.daysMissed} days`} />
                <DetailMeta label="Hourly rate" value={formatCurrency(data.hourlyRateUsd)} />
              </div>
              {damageNarrative.length > 0 && (
                <div className="narrative-list">
                  {damageNarrative.map(([label, value]) => (
                    <DetailMeta key={label} label={label} value={value} />
                  ))}
                </div>
              )}
            </section>

            {onSubmitAgreement && (
              <section className="detail-section agreement-section">
                <LawyerClientAgreement
                  caseId={data.id}
                  existingAgreement={existingAgreement}
                  agreementState={agreementState}
                  onSubmitAgreement={onSubmitAgreement}
                />
              </section>
            )}
          </div>

          <section className="detail-section full">
            <div className="section-head">
              <h4>Files & Evidence</h4>
              <span className="section-sub">
                {documents.length} file
                {documents.length === 1 ? '' : 's'}
              </span>
            </div>
            {documents.length === 0 && <p className="section-body">No files attached to this case yet.</p>}
            <ul className="file-list">
              {documents.map((doc, idx) => {
                const key = doc.id || idx
                const url = docLinks[key]
                const isLoading = docLoading[key]
                const errorMessage = docErrors[key]
                return (
                  <li key={key} className="file-row">
                    <div>
                      <div className="file-name">{resolveDocName(doc, idx)}</div>
                      {(doc.description || doc.notes || doc.kind) && (
                        <div className="file-note">{doc.description || doc.notes || doc.kind}</div>
                      )}
                      {errorMessage && <div className="file-note">{errorMessage}</div>}
                    </div>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleViewDocument(doc, key)}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Loading…' : url ? 'Open file' : 'View file'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

const DetailMeta = ({ label, value }) => (
  <div className="detail-meta-item">
    <span className="detail-label">{label}</span>
    <span className="detail-value">{value || '—'}</span>
  </div>
)

export default CaseDetail
