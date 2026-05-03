import React, { useEffect, useState } from 'react'
import { formatCurrency } from '../utils'
import { getCaseDocSignedUrl } from '../api/cases'
import LawyerClientAgreement from './LawyerClientAgreement'

const statusTone = {
  ready: { border: 'var(--green-500)', accent: 'var(--green-500)' },
  priority: { border: 'var(--red-500)', accent: 'var(--red-500)' },
  awaiting: { border: 'var(--blue-500)', accent: 'var(--blue-500)' },
  review: { border: 'var(--amber-500)', accent: 'var(--amber-500)' },
  submitted: { border: 'var(--amber-500)', accent: 'var(--amber-500)' },
}

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

const resolveDocUrl = (doc) =>
  doc?.signed_url || doc?.signedUrl || doc?.public_url || doc?.file_url || doc?.url

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

  const tone = statusTone[data.status] || statusTone.review
  const documents = Array.isArray(data.documents) ? data.documents : []
  const parties = Array.isArray(data.parties) ? data.parties : []
  const locationLabel = `${data.incident.city}, ${data.displayState || data.incident.state}`
  const handleViewDocument = async (doc, key) => {
    const currentUrl = resolveDocUrl(doc) || docLinks[key]
    if (currentUrl) {
      window.open(currentUrl, '_blank', 'noreferrer')
      return
    }

    setDocLoading((prev) => ({ ...prev, [key]: true }))
    setDocErrors((prev) => ({ ...prev, [key]: '' }))
    const url = await getCaseDocSignedUrl(doc)
    setDocLoading((prev) => ({ ...prev, [key]: false }))

    if (!url) {
      setDocErrors((prev) => ({ ...prev, [key]: 'Unable to load file.' }))
      return
    }

    setDocLinks((prev) => ({ ...prev, [key]: url }))
    window.open(url, '_blank', 'noreferrer')
  }

  return (
    <div className="case-modal-backdrop" onClick={onClose}>
      <div className="case-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" type="button" onClick={onClose} aria-label="Close case details">
          ×
        </button>

        <div className="detail-head" style={{ borderColor: tone.border }}>
          <div className="detail-main">
            <div className="detail-topline">
              <div className="case-value">{data.valueRange}</div>
              <span className="status-chip" style={{ background: `${tone.accent}22`, color: tone.accent }}>
                <span className="dot" style={{ background: tone.accent }} />
                {data.statusLabel || data.status}
              </span>
              <span className="urgency">SOL in {data.urgencyDays} days</span>
            </div>
            <h2 className="detail-title">{data.title}</h2>
          </div>

          <div className="detail-sidebar">
            {onSubmitAgreement && (
              <LawyerClientAgreement
                caseId={data.id}
                existingAgreement={existingAgreement}
                agreementState={agreementState}
                onSubmitAgreement={onSubmitAgreement}
              />
            )}
          </div>
        </div>

        <div className="detail-grid">
          <section className="detail-section">
            <div className="section-head">
              <h4>Incident details</h4>
              <span className="section-sub">{locationLabel}</span>
            </div>
            <p className="section-body">{data.incident.description || 'No incident narrative provided.'}</p>
            <div className="detail-list">
              <DetailMeta label="Date" value={formatDate(data.incident.date)} />
              <DetailMeta
                label="Contact"
                value={`${data.caseContact.fullName || '—'} • ${data.caseContact.method || '—'}`}
              />
              <DetailMeta label="Documents" value={`${documents.length}`} />
              <DetailMeta label="Value range" value={data.valueRange} />
            </div>
          </section>

          <section className="detail-section">
            <div className="section-head">
              <h4>Damages</h4>
              <span className="section-sub">Financial snapshot</span>
            </div>
            <div className="detail-list two-col">
              <DetailMeta label="Medical" value={formatCurrency(data.medicalDamageUsd)} />
              <DetailMeta label="Lost wages" value={formatCurrency(data.lostWagesUsd)} />
              <DetailMeta label="Days missed" value={`${data.daysMissed} days`} />
              <DetailMeta label="Daily rate" value={formatCurrency(data.dailyRateUsd)} />
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
                    <strong>{party.name || party.insurer || `Party ${idx + 1}`}</strong>
                    {party.role && <span className="party-role"> — {party.role}</span>}
                    {party.contact && <div className="party-note">{party.contact}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                const url = resolveDocUrl(doc) || docLinks[key]
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
