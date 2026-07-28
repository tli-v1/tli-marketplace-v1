import React, { useState } from 'react'

const statusTone = {
  ready: { border: 'var(--green-500)', accent: 'var(--green-500)' },
  priority: { border: 'var(--red-500)', accent: 'var(--red-500)' },
  awaiting: { border: 'var(--blue-500)', accent: 'var(--blue-500)' },
  review: { border: 'var(--amber-500)', accent: 'var(--amber-500)' },
  submitted: { border: 'var(--amber-500)', accent: 'var(--amber-500)' },
}

const formatCurrency = (amount) => `$${amount.toLocaleString()}`

const CaseCard = ({ data, view, agreementInfo, onOpen }) => {
  const [showFullTitle, setShowFullTitle] = useState(false)
  const baseTitle = data.title || data.description || ''
  const titleWords = baseTitle.split(/\s+/).filter(Boolean)
  const shouldTruncateTitle = titleWords.length > 10
  const displayTitle =
    showFullTitle || !shouldTruncateTitle ? baseTitle : `${titleWords.slice(0, 10).join(' ')}…`

  const tone = statusTone[data.status] || statusTone.review
  const docCount = data.documents?.length ?? 0
  const partiesLabel = data.parties.map((party) => party.name || party.insurer || party.role).filter(Boolean).join(' • ')

  return (
    <article className={`case-card ${view === 'list' ? 'list' : ''}`} style={{ borderColor: tone.border }}>
      <header className="case-head">
        <div>
          <div className="case-value">
            <span>{data.valueRange}</span>
          </div>
          <div className="title-row">
            <h3
              className={shouldTruncateTitle ? 'title-toggle' : ''}
              onClick={() => {
                if (shouldTruncateTitle) setShowFullTitle((prev) => !prev)
              }}
            >
              {displayTitle}
            </h3>
            {shouldTruncateTitle && (
              <button
                className="desc-toggle"
                type="button"
                onClick={() => setShowFullTitle((prev) => !prev)}
                aria-label="Toggle full description"
              >
                {showFullTitle ? 'Collapse' : 'Expand'}
              </button>
            )}
          </div>
        </div>
        <div className="case-areas">
          {data.practiceAreas.map((area) => (
            <span key={area} className="pill">
              {area}
            </span>
          ))}
        </div>
      </header>

      <div className="case-details">
        <DetailItem
          label="Incident"
          value={`${new Date(data.incident.date).toLocaleDateString()} • ${data.incident.city}, ${data.displayState || data.incident.state}`}
        />
        <DetailItem
          label="Damages"
          value={`${formatCurrency(data.medicalDamageUsd)} medical • ${formatCurrency(data.lostWagesUsd)} wages • ${data.daysMissed} days @ ${formatCurrency(data.hourlyRateUsd)}/hr`}
        />
        <DetailItem label="Evidence" value={`${docCount} documents`} />
        <DetailItem label="Contact" value={`${data.caseContact.fullName} • ${data.caseContact.method}`} />
        {partiesLabel && <DetailItem label="Parties" value={partiesLabel} />}
      </div>

      <div className="card-actions">
        <div className="agreement-status">
          {agreementInfo?.files?.length ? (
            <span className="pill soft">Agreement uploaded</span>
          ) : (
            <span className="pill soft muted">No agreement uploaded</span>
          )}
        </div>
        {onOpen && (
          <button type="button" className="secondary-btn" onClick={() => onOpen(data.id)}>
            View details
          </button>
        )}
      </div>
    </article>
  )
}

const DetailItem = ({ label, value }) => (
  <div className="detail-item">
    <span className="detail-label">{label}</span>
    <span className="detail-value">{value}</span>
  </div>
)

export default CaseCard
