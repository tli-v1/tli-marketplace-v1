import React from 'react'
import { formatCurrency } from '../utils'

const formatDate = (value) => {
  const parsed = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleDateString()
}

const damageSummary = (data) => {
  const parts = [
    data.medicalDamageUsd ? `${formatCurrency(data.medicalDamageUsd)} medical` : '',
    data.propertyDamageUsd ? `${formatCurrency(data.propertyDamageUsd)} property` : '',
    data.otherExpensesUsd ? `${formatCurrency(data.otherExpensesUsd)} expenses` : '',
    data.lostWagesUsd ? `${formatCurrency(data.lostWagesUsd)} wages` : '',
  ].filter(Boolean)

  return parts.length ? parts.join(' • ') : formatCurrency(0)
}

const CaseTable = ({ cases, page, pageSize, totalCount, onPageChange, onOpen }) => {
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1)
  const start = totalCount ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, totalCount)

  return (
    <div className="case-table-shell">
      <div className="case-table-wrap">
        <table className="case-table">
          <thead>
            <tr>
              <th>Date created</th>
              <th>Description</th>
              <th>Damages</th>
              <th>Documents</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => {
              const description = item.description || item.incident?.description || item.title || 'No description provided.'
              const displayDescription =
                description.length > 180 ? `${description.slice(0, 177).trimEnd()}...` : description
              const docs = item.documents?.length ?? 0

              return (
                <tr key={item.id} onClick={() => onOpen?.(item.id)}>
                  <td className="date-cell">{formatDate(item.createdAt)}</td>
                  <td>
                    <div className="table-description" title={description}>
                      {displayDescription}
                    </div>
                  </td>
                  <td>
                    <div className="table-damages" title={damageSummary(item)}>
                      <strong>{item.valueRange}</strong>
                      <span>{damageSummary(item)}</span>
                    </div>
                  </td>
                  <td>
                    <span className="doc-count">{docs}</span>
                  </td>
                  <td className="action-cell">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen?.(item.id)
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
            {cases.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-table">No cases match the current filters.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <span>
          Showing {start}-{end} of {totalCount}
        </span>
        <div className="pager-actions">
          <button type="button" className="secondary-btn" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span className="page-indicator">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

export default CaseTable
