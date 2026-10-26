import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchConversationalIntakes, fetchMarketplaceUsers, updateMarketplaceUserRole } from '../api/admin'
import { deleteCaseAsAdmin, fetchCases } from '../api/cases'
import { formatCurrency, mapCaseRow } from '../utils'

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString()
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

const getDateKey = (value) => {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getIntakeSearchText = (item) =>
  [
    item.id,
    item.status,
    item.currentStep,
    item.failureReason,
    item.contactName,
    item.contactEmail,
    item.contactPhone,
    item.caseId,
    item.leadId,
    ...(item.messages || []).map((message) => message.content),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

function AdminPage({ currentUserRole = '' }) {
  const [users, setUsers] = useState([])
  const [cases, setCases] = useState([])
  const [intakes, setIntakes] = useState([])
  const [requesterRole, setRequesterRole] = useState(currentUserRole)
  const [loading, setLoading] = useState(true)
  const [casesLoading, setCasesLoading] = useState(true)
  const [intakesLoading, setIntakesLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [deletingCaseId, setDeletingCaseId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [caseSearch, setCaseSearch] = useState('')
  const [intakeSearch, setIntakeSearch] = useState('')
  const [intakeFilter, setIntakeFilter] = useState('incomplete')
  const [targetEmail, setTargetEmail] = useState('')
  const [targetRole, setTargetRole] = useState('lawyer')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: usersError } = await fetchMarketplaceUsers()
    setLoading(false)
    if (usersError) {
      setError(usersError.message)
      return
    }
    setUsers(data.users)
    setRequesterRole(data.requesterRole || currentUserRole)
  }, [currentUserRole])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const loadCases = useCallback(async () => {
    setCasesLoading(true)
    const { data, error: casesError } = await fetchCases()
    setCasesLoading(false)
    if (casesError) {
      setError(casesError.message)
      return
    }
    setCases((data || []).map((item) => mapCaseRow(item)))
  }, [])

  useEffect(() => {
    loadCases()
  }, [loadCases])

  const loadIntakes = useCallback(async () => {
    setIntakesLoading(true)
    const { data, error: intakesError } = await fetchConversationalIntakes({ limit: 300 })
    setIntakesLoading(false)
    if (intakesError) {
      setError(intakesError.message)
      return
    }
    setIntakes(data || [])
  }, [])

  useEffect(() => {
    loadIntakes()
  }, [loadIntakes])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users

    return users.filter((user) =>
      [user.email, user.uid, user.displayName, user.role]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    )
  }, [users, search])

  const filteredCases = useMemo(() => {
    const query = caseSearch.trim().toLowerCase()
    if (!query) return cases

    return cases.filter((item) =>
      [item.id, item.title, item.description, item.caseContact?.fullName, item.caseContact?.email, item.stateCode]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    )
  }, [cases, caseSearch])

  const filteredIntakes = useMemo(() => {
    const query = intakeSearch.trim().toLowerCase()

    return intakes.filter((item) => {
      if (intakeFilter === 'incomplete' && item.completed) return false
      if (intakeFilter === 'completed' && !item.completed) return false
      if (!query) return true
      return getIntakeSearchText(item).includes(query)
    })
  }, [intakes, intakeFilter, intakeSearch])

  const intakesByDay = useMemo(() => {
    const groups = new Map()
    filteredIntakes.forEach((item) => {
      const key = getDateKey(item.timestamp || item.updatedAt || item.createdAt)
      const current = groups.get(key) || []
      current.push(item)
      groups.set(key, current)
    })

    return [...groups.entries()].map(([dateKey, items]) => ({
      dateKey,
      items,
      incompleteCount: items.filter((item) => !item.completed).length,
    }))
  }, [filteredIntakes])

  const incompleteIntakeCount = useMemo(() => intakes.filter((item) => !item.completed).length, [intakes])

  const upsertUser = (nextUser) => {
    setUsers((current) => {
      const exists = current.some((user) => user.uid === nextUser.uid)
      if (!exists && ['lawyer', 'admin', 'owner'].includes(nextUser.role)) {
        return [...current, nextUser].sort((a, b) => a.email.localeCompare(b.email))
      }
      if (nextUser.role === '') {
        return current.filter((user) => user.uid !== nextUser.uid)
      }
      return current.map((user) => (user.uid === nextUser.uid ? nextUser : user))
    })
  }

  const handleSetRole = async ({ uid = '', email = '', role }) => {
    const key = uid || email
    setSavingKey(`${key}:${role}`)
    setMessage('')
    setError('')
    const { data, error: updateError } = await updateMarketplaceUserRole({ uid, email, role })
    setSavingKey('')

    if (updateError) {
      setError(updateError.message)
      return
    }

    if (data) {
      upsertUser(data)
      setMessage(`${data.email || data.uid} updated to ${data.role || 'no marketplace role'}.`)
    }
  }

  const handleAssignByEmail = async (event) => {
    event.preventDefault()
    await handleSetRole({ email: targetEmail, role: targetRole })
    setTargetEmail('')
  }

  const handleDeleteCase = async (item) => {
    const label = item.title || item.id
    const confirmed = window.confirm(
      `Delete this marketplace case?\n\n${label}\n\nThis removes the case, related SQL records, and associated Storage files.`,
    )
    if (!confirmed) return

    setDeletingCaseId(item.id)
    setMessage('')
    setError('')
    const { data, error: deleteError } = await deleteCaseAsAdmin(item)
    setDeletingCaseId('')

    if (deleteError) {
      if (data?.caseDeleted) {
        setCases((current) => current.filter((caseItem) => caseItem.id !== item.id))
      }
      setError(deleteError.message)
      return
    }

    setCases((current) => current.filter((caseItem) => caseItem.id !== item.id))
    setMessage(`Deleted case ${item.id}. Removed ${data?.deletedFileCount || 0} storage file(s).`)
  }

  const canManageElevatedRoles = requesterRole === 'owner'
  const canDeleteCases = ['admin', 'owner'].includes(requesterRole || currentUserRole)
  const canSetRole = (user, role) => {
    const currentRole = user?.role || ''
    return canManageElevatedRoles || (role === 'lawyer' && !['admin', 'owner'].includes(currentRole))
  }

  return (
    <main className="admin-page">
      <section className="admin-hero">
        <div>
          <p className="eyebrow">Admin mode</p>
          <h1>Marketplace user management</h1>
          <p>Manage Firebase marketplace roles for lawyer, admin, and owner accounts.</p>
        </div>
        <button className="secondary-btn" type="button" onClick={loadUsers} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      <section className="admin-grid">
        <form className="admin-card admin-form" onSubmit={handleAssignByEmail}>
          <div>
            <h2>Assign role by email</h2>
            <p>Use this for existing Firebase Auth accounts that need marketplace access.</p>
          </div>
          <label>
            <span>Email</span>
            <input
              type="email"
              required
              value={targetEmail}
              onChange={(event) => setTargetEmail(event.target.value)}
              placeholder="lawyer@example.com"
            />
          </label>
          <label>
            <span>Role</span>
            <select value={targetRole} onChange={(event) => setTargetRole(event.target.value)}>
              <option value="lawyer">Lawyer</option>
              {canManageElevatedRoles && <option value="admin">Admin</option>}
              {canManageElevatedRoles && <option value="owner">Owner</option>}
            </select>
          </label>
          <button className="primary-btn" type="submit" disabled={Boolean(savingKey)}>
            {savingKey === `${targetEmail}:${targetRole}` ? 'Saving...' : 'Assign role'}
          </button>
        </form>

        <div className="admin-card">
          <h2>Access notes</h2>
          <p>
            Role changes update Firebase custom claims and revoke refresh tokens. Only owners can create, change, or
            revoke admin and owner accounts.
          </p>
        </div>
      </section>

      {(message || error) && (
        <div className={`admin-message ${error ? 'error' : ''}`}>
          {error || message}
        </div>
      )}

      <section className="admin-card">
        <div className="admin-table-head">
          <div>
            <h2>Marketplace users</h2>
            <p>{filteredUsers.length} users</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email, uid, or role"
          />
        </div>

        {loading ? (
          <div className="admin-empty">Loading users...</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last sign in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.uid}>
                    <td>
                      <strong>{user.email || '-'}</strong>
                      <span>{user.uid}</span>
                    </td>
                    <td>
                      <span className={`role-chip ${user.role}`}>{user.role}</span>
                    </td>
                    <td>{user.disabled ? 'Disabled' : user.emailVerified ? 'Verified' : 'Unverified'}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{formatDate(user.lastSignInAt)}</td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          onClick={() => handleSetRole({ uid: user.uid, role: 'lawyer' })}
                          disabled={savingKey === `${user.uid}:lawyer` || user.role === 'lawyer' || !canSetRole(user, 'lawyer')}
                        >
                          Lawyer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetRole({ uid: user.uid, role: 'admin' })}
                          disabled={savingKey === `${user.uid}:admin` || user.role === 'admin' || !canManageElevatedRoles}
                        >
                          Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetRole({ uid: user.uid, role: 'owner' })}
                          disabled={savingKey === `${user.uid}:owner` || user.role === 'owner' || !canManageElevatedRoles}
                        >
                          Owner
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetRole({ uid: user.uid, role: 'none' })}
                          disabled={
                            savingKey === `${user.uid}:none`
                            || (!canManageElevatedRoles && ['admin', 'owner'].includes(user.role))
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredUsers.length && <div className="admin-empty">No matching marketplace users.</div>}
          </div>
        )}
      </section>

      {canDeleteCases && (
        <section className="admin-card">
          <div className="admin-table-head">
            <div>
              <h2>Marketplace cases</h2>
              <p>{filteredCases.length} cases</p>
            </div>
            <div className="admin-table-tools">
              <input
                type="search"
                value={caseSearch}
                onChange={(event) => setCaseSearch(event.target.value)}
                placeholder="Search case, contact, or state"
              />
              <button className="secondary-btn" type="button" onClick={loadCases} disabled={casesLoading}>
                {casesLoading ? 'Refreshing...' : 'Refresh cases'}
              </button>
            </div>
          </div>

          {casesLoading ? (
            <div className="admin-empty">Loading cases...</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-case-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Contact</th>
                    <th>Damages</th>
                    <th>Documents</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </td>
                      <td>
                        <strong>{item.caseContact?.fullName || '-'}</strong>
                        <span>{item.caseContact?.email || item.caseContact?.phone || item.stateCode || '-'}</span>
                      </td>
                      <td>
                        <strong>{item.valueRange}</strong>
                        <span>
                          {formatCurrency(item.medicalDamageUsd)} medical · {formatCurrency(item.lostWagesUsd)} wages
                        </span>
                      </td>
                      <td>{item.documents?.length || 0}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => handleDeleteCase(item)}
                            disabled={deletingCaseId === item.id}
                          >
                            {deletingCaseId === item.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredCases.length && <div className="admin-empty">No matching marketplace cases.</div>}
            </div>
          )}
        </section>
      )}

      {canDeleteCases && (
        <section className="admin-card admin-intakes-card">
          <div className="admin-table-head">
            <div>
              <h2>Conversational intakes</h2>
              <p>
                {filteredIntakes.length} shown · {incompleteIntakeCount} incomplete
              </p>
            </div>
            <div className="admin-table-tools">
              <select value={intakeFilter} onChange={(event) => setIntakeFilter(event.target.value)}>
                <option value="incomplete">Incomplete only</option>
                <option value="all">All intakes</option>
                <option value="completed">Completed only</option>
              </select>
              <input
                type="search"
                value={intakeSearch}
                onChange={(event) => setIntakeSearch(event.target.value)}
                placeholder="Search transcript, contact, or status"
              />
              <button className="secondary-btn" type="button" onClick={loadIntakes} disabled={intakesLoading}>
                {intakesLoading ? 'Refreshing...' : 'Refresh intakes'}
              </button>
            </div>
          </div>

          {intakesLoading ? (
            <div className="admin-empty">Loading conversational intakes...</div>
          ) : (
            <div className="admin-intake-days">
              {intakesByDay.map((group) => (
                <section className="admin-intake-day" key={group.dateKey}>
                  <div className="admin-intake-day-head">
                    <h3>{group.dateKey}</h3>
                    <span>
                      {group.items.length} intake{group.items.length === 1 ? '' : 's'} · {group.incompleteCount} incomplete
                    </span>
                  </div>
                  <div className="admin-intake-list">
                    {group.items.map((item) => (
                      <article className={`admin-intake ${item.completed ? 'complete' : 'incomplete'}`} key={item.id}>
                        <div className="admin-intake-summary">
                          <div>
                            <strong>{item.contactName || item.contactEmail || item.contactPhone || item.id}</strong>
                            <span>{formatDateTime(item.timestamp || item.updatedAt || item.createdAt)}</span>
                          </div>
                          <span className={`intake-chip ${item.completed ? 'complete' : 'incomplete'}`}>
                            {item.completed ? 'Complete' : 'Incomplete'}
                          </span>
                        </div>
                        <div className="admin-intake-meta">
                          <span>Status: {item.status || '-'}</span>
                          <span>Step: {item.currentStep || '-'}</span>
                          <span>Messages: {item.messageCount || 0}</span>
                          {(item.caseId || item.leadId) && <span>Lead/case: {item.caseId || item.leadId}</span>}
                        </div>
                        {item.failureReason && <p className="admin-intake-warning">{item.failureReason}</p>}
                        {item.messages?.length > 0 && (
                          <details className="admin-intake-details">
                            <summary>Transcript</summary>
                            <div className="admin-transcript">
                              {item.messages.map((turn) => (
                                <div className="admin-turn" key={`${item.id}-${turn.index}`}>
                                  <span>{turn.role || `Message ${turn.index + 1}`}</span>
                                  <p>{turn.content || '-'}</p>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        <details className="admin-intake-details">
                          <summary>Raw Firestore fields</summary>
                          <pre>{JSON.stringify(item.raw, null, 2)}</pre>
                        </details>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
              {!intakesByDay.length && <div className="admin-empty">No matching conversational intakes.</div>}
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default AdminPage
