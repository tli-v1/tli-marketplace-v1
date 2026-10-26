import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  checkLawyerAccess,
  getSession,
  getUser,
  onAuthStateChange,
  signInWithPassword,
  signOut,
  signUp,
} from './api/auth'
import CaseDetail from './components/CaseDetail'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import CaseTable from './components/CaseTable'
import StateFilter from './components/StateFilter'
import LawFirmApplicationPage from './pages/LawFirmApplicationPage'
import AdminPage from './pages/AdminPage'
import { mapCaseRow, parseValueCeiling } from './utils'
import { fetchCases } from './api/cases'
import { fetchStateCodes } from './api/stateCodes'
import { fetchMyAgreements, submitAgreement } from './api/agreements'
import {
  defaultNotificationPreferences,
  ensureMarketplaceUserProfiles,
  fetchNotificationPreferences,
  fetchUserProfile,
  saveNotificationPreferences,
} from './api/users'
import { formatRetryCountdown } from './api/authErrors'
import './App.css'
import './workspace.css'

const tliLogo = '/tli_logo.png'
const fallbackStates = ['Missouri', 'Kansas', 'Nebraska', 'Iowa']
const practiceAreas = [
  'Personal Injury',
  'Auto',
  'Premises Liability',
  'Medical Malpractice',
  'Products Liability',
  'Trucking',
  'Employment',
  'Animal Liability',
  'Workplace Safety',
]

const toTime = (value) => {
  if (!value) return 0
  const date = value.toDate ? value.toDate() : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

const Checkbox = ({ label, checked, onChange }) => (
  <label className="checkbox">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span>{label}</span>
  </label>
)

function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState(new Set())
  const [practiceFilter, setPracticeFilter] = useState(new Set())
  const [sort, setSort] = useState('created')
  const [tablePage, setTablePage] = useState(1)
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupMessage, setSignupMessage] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)
  const [assignLoading, setAssignLoading] = useState(false)
  const [signOutLoading, setSignOutLoading] = useState(false)
  const [stateCodes, setStateCodes] = useState([])
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [signInMessage, setSignInMessage] = useState('')
  const [signInLoading, setSignInLoading] = useState(false)
  const [signInRetryUntil, setSignInRetryUntil] = useState(0)
  const [signInRetrySeconds, setSignInRetrySeconds] = useState(0)
  const [userIdentity, setUserIdentity] = useState({ displayName: '', email: '', phone: '' })
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [roleChecked, setRoleChecked] = useState(false)
  const [profileProvisionError, setProfileProvisionError] = useState('')
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [agreementState, setAgreementState] = useState({})
  const [myAgreements, setMyAgreements] = useState({})
  const selectedCaseId = currentPath.match(/^\/cases\/([a-zA-Z0-9-]+)\/?$/)?.[1] || null
  const page = currentPath === '/settings' ? 'profile' : 'marketplace'
  const isAdminPage = currentPath === '/admin'
  const [notificationPrefs, setNotificationPrefs] = useState(defaultNotificationPreferences)
  const [notificationDraft, setNotificationDraft] = useState(defaultNotificationPreferences)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const showAuth = import.meta.env.VITE_SHOW_SIGN_IN === 'true'
  const tablePageSize = 10

  useEffect(() => {
    if (!signInRetryUntil) return
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((signInRetryUntil - Date.now()) / 1000))
      setSignInRetrySeconds(remaining)
      if (!remaining) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [signInRetryUntil])

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
      requestAnimationFrame(() => window.scrollTo(0, window.history.state?.scrollY || 0))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    const cached = localStorage.getItem(`cases-cache:${session.user.id}`)
    if (!cached) return
    try {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length) {
        setCases(parsed)
        setLoading(false)
      }
    } catch (err) {
      console.warn('Failed to parse cached cases', err)
    }
  }, [session])

  useEffect(() => {
    const initSession = async () => {
      const { data, error } = await getSession()
      if (!error) {
        setSession(data.session)
      }
      setAuthChecked(true)
    }

    initSession()

    const { data: listener } = onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      listener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const checkRole = async () => {
      if (!session?.user?.id) {
        setRoleChecked(false)
        setIsAuthorized(false)
        setUserRole('')
        setProfileProvisionError('')
        return
      }
      const cacheKey = `role-cache:${session.user.id}`
      const cachedRole = localStorage.getItem(cacheKey)
      if (['lawyer', 'admin', 'owner'].includes(cachedRole)) {
        setIsAuthorized(true)
        setUserRole(cachedRole)
        setRoleChecked(true)
      }
      setRoleChecked(false)
      const { isAuthorized, role, error } = await checkLawyerAccess(session.user.id)
      if (cancelled) return
      setIsAuthorized(isAuthorized)
      setUserRole(isAuthorized ? role : '')
      if (isAuthorized) {
        const { error: profileError } = await ensureMarketplaceUserProfiles(session.user.id)
        if (cancelled) return
        setProfileProvisionError(profileError?.message || '')
      }
      setRoleChecked(true)
      localStorage.setItem(cacheKey, isAuthorized ? role : 'denied')
      if (!isAuthorized) {
        if (error) {
          console.error('Fetch user profile error', error)
        }
        setSignInMessage('You do not have the appropriate access to view the marketplace.')
        await signOut()
      }
    }

    checkRole()
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    const loadCases = async () => {
      setError('')
      try {
        if (!authChecked) {
          return
        }
        if (isAdminPage) {
          setLoading(false)
          return
        }
        if (!session) {
          console.log('Fetch cases skipped: no session')
          setCases([])
          setLoading(false)
          return
        }
        if (!roleChecked || !isAuthorized) {
          return
        }
        setLoading(true)
        const { data: caseRows, error: casesError } = await fetchCases()
        if (casesError) {
          console.error('Fetch cases error', casesError)
          setError(casesError.message)
          setCases([])
          return
        }

        const normalized = (caseRows || []).map((row) => mapCaseRow(row))
        setCases(normalized)
        if (session?.user?.id) {
          localStorage.setItem(`cases-cache:${session.user.id}`, JSON.stringify(normalized))
        }
      } catch (err) {
        console.error('Fetch cases failed', err)
        setError(err?.message || 'Unknown error')
        setCases([])
      } finally {
        setLoading(false)
      }
    }

    loadCases()
  }, [authChecked, session, roleChecked, isAuthorized, isAdminPage])

  useEffect(() => {
    const fetchUserIdentity = async () => {
      if (!session) {
        setUserIdentity({ displayName: '', email: '', phone: '' })
        return
      }
      const { data: userData, error: userError } = await getUser()
      if (userError || !userData?.user) return

      const email = userData.user.email || ''
      let displayName = email

      const { data: profileData, error: profileError } = await fetchUserProfile(userData.user.id)

      if (!profileError && profileData?.full_name) {
        displayName = profileData.full_name
      }

      setUserIdentity({ displayName, email, phone: profileData?.phone || '' })
    }

    fetchUserIdentity()
  }, [session])

  useEffect(() => {
    const fetchMyAgreementsForUser = async () => {
      if (isAdminPage) {
        setMyAgreements({})
        return
      }
      if (!session?.user?.id) {
        setMyAgreements({})
        return
      }
      const { data, error } = await fetchMyAgreements(session.user.id)
      if (error) {
        console.error('Fetch my agreements error', error)
        return
      }
      const map = {}
      ;(data || []).forEach((row) => {
        map[row.case_id] = {
          id: row.id,
          message: row.message,
          files: row.files || [],
          createdAt: row.created_at,
        }
      })
      setMyAgreements(map)
    }
    fetchMyAgreementsForUser()
  }, [session, isAdminPage])

  useEffect(() => {
    const loadNotificationPreferences = async () => {
      if (isAdminPage) {
        setNotificationPrefs(defaultNotificationPreferences)
        setNotificationDraft(defaultNotificationPreferences)
        setNotificationMessage('')
        return
      }
      if (!session?.user?.id) {
        setNotificationPrefs(defaultNotificationPreferences)
        setNotificationDraft(defaultNotificationPreferences)
        setNotificationMessage('')
        return
      }
      if (!roleChecked || !isAuthorized) return

      try {
        const { data, error } = await fetchNotificationPreferences(session.user.id)
        if (error) {
          console.error('Fetch notification preferences error', error)
          setNotificationMessage(`Unable to load notification settings: ${error.message}`)
          return
        }
        setNotificationPrefs(data)
        setNotificationDraft(data)
        setNotificationMessage('')
      } catch (error) {
        console.error('Fetch notification preferences error', error)
        setNotificationMessage(`Unable to load notification settings: ${error.message}`)
      }
    }

    loadNotificationPreferences()
  }, [session, isAdminPage, roleChecked, isAuthorized])

  useEffect(() => {
    const loadStateCodes = async () => {
      const { data, error } = await fetchStateCodes()
      if (error) {
        console.error('Fetch state codes error', error)
        return
      }
      setStateCodes(data || [])
    }
    loadStateCodes()
  }, [])

  const stateCodeMap = useMemo(
    () => new Map(stateCodes.map((item) => [item.code.toUpperCase(), item.name])),
    [stateCodes],
  )
  const selectedCase = useMemo(
    () => cases.find((item) => item.id.replaceAll('-', '') === selectedCaseId?.replaceAll('-', '')),
    [cases, selectedCaseId],
  )
  const resolveStateLabel = useCallback(
    (item) => {
      const code = (item.stateCode || item.state || '').toUpperCase()
      return stateCodeMap.get(code) || item.state || code || 'Unknown'
    },
    [stateCodeMap],
  )

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase()
    const filteredCases = cases.filter((item) => {
      const itemStateCode = (item.stateCode || item.state || '').toUpperCase()
      const matchesState = stateFilter.size === 0 || stateFilter.has(itemStateCode)
      const matchesPractice =
        practiceFilter.size === 0 || item.practiceAreas.some((area) => practiceFilter.has(area))
      const matchesSearch =
        !searchLower ||
        item.title.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower) ||
        item.incident.description.toLowerCase().includes(searchLower)

      return matchesState && matchesPractice && matchesSearch
    })

    const sorted = [...filteredCases]
    if (sort === 'created') {
      sorted.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
    } else if (sort === 'urgency') {
      sorted.sort((a, b) => a.urgencyDays - b.urgencyDays)
    } else if (sort === 'value-high') {
      sorted.sort((a, b) => parseValueCeiling(b.valueRange) - parseValueCeiling(a.valueRange))
    } else if (sort === 'recent') {
      sorted.sort((a, b) => toTime(b.incident.date) - toTime(a.incident.date))
    }

    return sorted.map((item) => ({ ...item, displayState: resolveStateLabel(item) }))
  }, [search, sort, stateFilter, practiceFilter, cases, resolveStateLabel])

  useEffect(() => {
    setTablePage(1)
  }, [search, sort, stateFilter, practiceFilter])

  const tableCases = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize
    return filtered.slice(start, start + tablePageSize)
  }, [filtered, tablePage])

  const handleTablePageChange = (nextPage) => {
    const maxPage = Math.max(Math.ceil(filtered.length / tablePageSize), 1)
    setTablePage(Math.min(Math.max(nextPage, 1), maxPage))
  }

  const handleSubmitAgreement = async ({ caseId, file, message }) => {
    if (!session?.user?.id) {
      setAgreementState((prev) => ({
        ...prev,
        [caseId]: { loading: false, message: 'Sign in to upload agreements.' },
      }))
      return
    }
    if (!file) {
      setAgreementState((prev) => ({
        ...prev,
        [caseId]: { loading: false, message: 'Please attach a PDF agreement before uploading.' },
      }))
      return
    }
    setAgreementState((prev) => ({ ...prev, [caseId]: { loading: true, message: '' } }))
    const { data, error } = await submitAgreement({
      caseId,
      lawyerId: session.user.id,
      file,
      message,
    })
    if (error) {
      setAgreementState((prev) => ({
        ...prev,
        [caseId]: { loading: false, message: `Upload failed: ${error.message}` },
      }))
      return
    }
    setAgreementState((prev) => ({
      ...prev,
      [caseId]: { loading: false, message: 'Agreement uploaded.' },
    }))
    setMyAgreements((prev) => ({
      ...prev,
      [caseId]: {
        ...(prev[caseId] || {}),
        id: data?.agreementId || prev[caseId]?.id,
        message,
        files: [
          ...(prev[caseId]?.files || []),
          { file_name: file.name, public_url: data?.publicUrl },
        ],
      },
    }))
  }

  const togglePractice = (name) => {
    setPracticeFilter((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const resetFilters = () => {
    setStateFilter(new Set())
    setPracticeFilter(new Set())
    setSearch('')
    setSort('created')
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    setSignupMessage('')
    setSignInMessage('')
    setSignupLoading(true)
    const { data, error: signUpError } = await signUp({ email: signupEmail, password: signupPassword })
    setSignupLoading(false)

    if (signUpError) {
      setSignupMessage(`Error: ${signUpError.message}`)
      return
    }

    const assignerUrl = import.meta.env.VITE_LAWYER_ASSIGNER_URL
    if (!assignerUrl) {
      setSignupMessage('Error: missing VITE_LAWYER_ASSIGNER_URL env for role assignment.')
      return
    }

    let token = data?.session?.access_token
    if (!token) {
      setSignupMessage('Signup created. Confirm email, sign in, then click "Assign lawyer role" below to finish setup.')
      return
    }

    const resp = await fetch(assignerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!resp.ok) {
      const errText = await resp.text()
      setSignupMessage(`Account created, but role assignment failed (${resp.status}): ${errText}`)
      return
    }

    setSignupMessage('Account created and role set to lawyer. You can now call the edge function.')
    setSignupEmail('')
    setSignupPassword('')
  }

  const handleAssignRole = async () => {
    setSignupMessage('')
    const assignerUrl = import.meta.env.VITE_LAWYER_ASSIGNER_URL
    if (!assignerUrl) {
      setSignupMessage('Error: missing VITE_LAWYER_ASSIGNER_URL env for role assignment.')
      return
    }
    setAssignLoading(true)
    const { data: sessionData, error: sessionError } = await getSession()
    if (sessionError || !sessionData?.session?.access_token) {
      setAssignLoading(false)
      setSignupMessage('Sign in after confirming email, then click Assign lawyer role.')
      return
    }

    const resp = await fetch(assignerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    })
    setAssignLoading(false)

    if (!resp.ok) {
      const errText = await resp.text()
      setSignupMessage(`Role assignment failed (${resp.status}): ${errText}`)
      return
    }

    setSignupMessage('Role set to lawyer. You can now call the edge function.')
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    if (signInLoading || signInRetrySeconds > 0) return
    setSignInMessage('')
    setSignupMessage('')
    setSignInLoading(true)
    const { data, error: signInError } = await signInWithPassword({
      email: signInEmail,
      password: signInPassword,
    })
    setSignInLoading(false)

    if (signInError) {
      const delay = signInError.retryAfterMs || 0
      setSignInRetryUntil(delay ? Date.now() + delay : 0)
      setSignInRetrySeconds(Math.ceil(delay / 1000))
      setSignInMessage(delay
        ? 'Too many attempts. Please wait before trying again.'
        : signInError.message)
      return
    }

    if (!data.session) {
      setSignInMessage('Sign in succeeded, but no session returned. Check email confirmation status.')
      return
    }

    setSignInMessage('Signed in. You can now assign the lawyer role or use the app.')
  }

  const handleSignOut = async () => {
    setSignInMessage('')
    setSignupMessage('')
    setSignOutLoading(true)
    const { error: signOutError } = await signOut()
    if (signOutError) {
      setSignInMessage(`Sign out failed: ${signOutError.message}`)
    }
    if (session?.user?.id) {
      localStorage.removeItem(`cases-cache:${session.user.id}`)
      localStorage.removeItem(`role-cache:${session.user.id}`)
    }
    setSignOutLoading(false)
  }

  const handleNotificationToggle = (key) => {
    setNotificationDraft((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleNotificationCadence = (value) => {
    if (!['immediate', 'daily', 'weekly'].includes(value)) return
    setNotificationDraft((prev) => ({ ...prev, alertCadence: value }))
  }

  const navigateTo = (path) => {
    window.history.replaceState({ ...window.history.state, scrollY: window.scrollY }, '', window.location.href)
    window.history.pushState({ scrollY: 0 }, '', path)
    setCurrentPath(path)
    window.scrollTo(0, 0)
  }

  const handleSaveNotificationPreferences = async (event) => {
    event.preventDefault()
    if (!session?.user?.id) return

    setNotificationMessage('')
    setNotificationSaving(true)
    try {
      const { data, error } = await saveNotificationPreferences(session.user.id, notificationDraft)
      if (error) {
        setNotificationMessage(`Save failed: ${error.message}`)
        return
      }

      setNotificationPrefs(data)
      setNotificationDraft(data)
      setNotificationMessage('Notification settings saved.')
    } finally {
      setNotificationSaving(false)
    }
  }

  if (currentPath !== '/apply' && session && !roleChecked) {
    return <main className="auth-page" role="status">Preparing your marketplace profile…</main>
  }

  if (currentPath !== '/apply' && profileProvisionError && session && roleChecked && isAuthorized) {
    return (
      <main className="auth-page">
        <div className="auth-message" role="alert">
          Unable to initialize your marketplace profile: {profileProvisionError}
        </div>
        <button className="primary-btn" onClick={() => window.location.reload()}>Retry profile setup</button>
      </main>
    )
  }

  if (currentPath === '/apply') {
    return (
      <LawFirmApplicationPage
        stateCodes={stateCodes}
        fallbackStates={fallbackStates}
        practiceAreas={practiceAreas}
      />
    )
  }

  if (!authChecked) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-title">Loading…</div>
          <p className="auth-sub">Checking your session, please hold.</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-head">
            <img src={tliLogo} alt="TLI logo" className="brand-logo" />
            <div>
              <div className="auth-title">TLI Marketplace</div>
              <div className="auth-sub">Sign in to access private case data</div>
            </div>
          </div>
          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                placeholder="lawyer@example.com"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                required
                minLength={8}
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                placeholder="Your password"
              />
            </label>
            <button type="submit" disabled={signInLoading || signInRetrySeconds > 0}>
              {signInRetrySeconds > 0
                ? `Try again in ${formatRetryCountdown(signInRetrySeconds)}`
                : signInLoading ? 'Signing in…' : 'Sign in'}
            </button>
            <small className="auth-hint">Access limited to authorized lawyers.</small>
          </form>
          {signInMessage && <div className="auth-message" role="status">{signInMessage}</div>}
          <div className="apply-cta">
            <span>Don&apos;t have access, apply now</span>
            <a className="secondary-btn apply-link" href="/apply">
              Apply
            </a>
          </div>
        </div>

        {showAuth && (
          <div className="auth-card">
            <div className="auth-title">Create a test lawyer account</div>
            <div className="auth-sub">Temporary signup for QA only</div>
            <form className="auth-form" onSubmit={handleSignup}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="lawyer@example.com"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <div className="auth-actions">
                <button type="submit" disabled={signupLoading}>
                  {signupLoading ? 'Creating…' : 'Create lawyer account'}
                </button>
                <button type="button" onClick={handleAssignRole} disabled={assignLoading}>
                  {assignLoading ? 'Assigning…' : 'Assign lawyer role (after sign-in)'}
                </button>
              </div>
              <small className="auth-hint">
                Uses <code>VITE_LAWYER_ASSIGNER_URL</code> to set <code>app_metadata.role = "lawyer"</code>. Disable after testing.
              </small>
            </form>
            {signupMessage && <div className="auth-message">{signupMessage}</div>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-shell marketplace-workspace">
      <a className="workspace-skip" href="#workspace-content">Skip to content</a>
      <WorkspaceSidebar
        key={selectedCaseId || 'workspace'} caseId={selectedCaseId}
        isSettings={page === 'profile'} isAdmin={currentPath === '/admin'}
        canAdmin={['admin', 'owner'].includes(userRole)} adminUrl={import.meta.env.VITE_ADMIN_URL}
        navigate={navigateTo} onSignOut={handleSignOut} signingOut={signOutLoading}
        email={userIdentity.email || session.user.email}
        filters={!selectedCaseId && page !== 'profile' && !isAdminPage ? (
          <details className="workspace-filters">
            <summary>Filter cases{stateFilter.size + practiceFilter.size > 0 ? ` · ${stateFilter.size + practiceFilter.size} active` : ''}</summary>
          <div className="sidebar-filter-body">
            <div className="sidebar-filter-controls">
              <div className="panel-head">
                <span className="panel-title">Filters</span>
                <button className="link" onClick={resetFilters}>
                  Reset
                </button>
              </div>

              <div className="filter-group">
                <div className="group-title">State (license filter)</div>
                <StateFilter
                  stateCodes={stateCodes}
                  fallbackStates={fallbackStates}
                  value={stateFilter}
                  onChange={(next) => setStateFilter(new Set(next))}
                />
              </div>

              <div className="filter-group">
                <div className="group-title">Practice area</div>
                <div className="stack">
                  {practiceAreas.map((area) => (
                    <Checkbox
                      key={area}
                      label={area}
                      checked={practiceFilter.has(area)}
                      onChange={() => togglePractice(area)}
                    />
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="group-title">Sort by</div>
                <div className="select">
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="created">Date created</option>
                    <option value="urgency">SOL urgency</option>
                    <option value="recent">Most recent incident</option>
                    <option value="value-high">Value high to low</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
          </details>
        ) : null}
      />
      <div className="workspace-main" id="workspace-content">
        {!selectedCaseId && <header className="workspace-heading">
          <div>
            <p className="eyebrow">Lawyer workspace</p>
            <h1>{currentPath === '/admin' ? 'Administration' : page === 'profile' ? 'Profile & alerts' : 'Marketplace cases'}</h1>
            <p>{page === 'profile' ? 'Manage your new-case notifications.' : currentPath === '/admin' ? 'Manage users and case submissions.' : 'Review the facts, explore supporting documents, and find cases to pursue.'}</p>
          </div>
          {currentPath !== '/admin' && page === 'marketplace' && <label className="workspace-search">
            <SearchIcon /><span className="sr-only">Search cases</span>
            <input type="search" placeholder="Search cases or fact patterns…" value={search} onChange={event => setSearch(event.target.value)} />
          </label>}
        </header>}


      {currentPath === '/admin' ? (
        ['admin', 'owner'].includes(userRole) ? (
          <AdminPage currentUserRole={userRole} />
        ) : (
          <main className="admin-page">
            <section className="admin-card">
              <h1>Admin access required</h1>
              <p>Your account does not have permission to manage marketplace users.</p>
            </section>
          </main>
        )
      ) : selectedCaseId ? (
        selectedCase ? <CaseDetail
          key={selectedCase.id} data={selectedCase}
          onClose={() => window.history.state?.fromCaseList ? window.history.back() : navigateTo('/')}
          onSubmitAgreement={handleSubmitAgreement}
          existingAgreement={myAgreements[selectedCase.id]}
          agreementState={agreementState[selectedCase.id] || { loading: false, message: '' }}
        /> : <main className="workspace-empty" role="status">
          <h1>{loading ? 'Loading case…' : error ? 'Unable to load case' : 'Case unavailable'}</h1>
          <p>{loading ? 'Loading the intake and supporting documents.' : error || 'This case may have been removed or is not available to your account.'}</p>
          <a href="/" onClick={event => { event.preventDefault(); navigateTo('/') }}>Back to cases</a>
        </main>
      ) : page === 'profile' ? (
        <main className="profile-page">
          <section className="profile-card">
            <div className="profile-head">
              <div>
                <h1>Profile</h1>
                <p>{userIdentity.email || session.user.email}</p>
              </div>
              <div className="profile-badge">
                {userRole === 'owner' ? 'Owner' : userRole === 'admin' ? 'Admin' : 'Lawyer'}
              </div>
            </div>

            <form className="profile-form" onSubmit={handleSaveNotificationPreferences}>
              <div className="settings-section">
                <div>
                  <h2>New case notifications</h2>
                  <p>Choose where marketplace alerts should be sent when new cases are available.</p>
                </div>
                <div className="settings-grid">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={notificationDraft.emailNewCases}
                      onChange={() => handleNotificationToggle('emailNewCases')}
                      disabled={notificationSaving}
                    />
                    <span>
                      <strong>Email alerts</strong>
                      <small>{userIdentity.email || session.user.email || 'Account email'}</small>
                    </span>
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={notificationDraft.smsNewCases}
                      onChange={() => handleNotificationToggle('smsNewCases')}
                      disabled={notificationSaving}
                    />
                    <span>
                      <strong>SMS alerts</strong>
                      <small>{userIdentity.phone || 'Uses phone on your user profile when configured'}</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <div>
                  <h2>Alert timeframe</h2>
                  <p>Set whether new-case alerts are sent immediately or grouped.</p>
                </div>
                <div className="segmented-control" role="radiogroup" aria-label="Alert timeframe">
                  {[
                    ['immediate', 'Immediate'],
                    ['daily', 'Daily'],
                    ['weekly', 'Weekly'],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className={notificationDraft.alertCadence === value ? 'active' : ''}
                    >
                      <input
                        type="radio"
                        name="alertCadence"
                        value={value}
                        checked={notificationDraft.alertCadence === value}
                        onChange={() => handleNotificationCadence(value)}
                        disabled={notificationSaving}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="profile-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setNotificationDraft(notificationPrefs)}
                  disabled={notificationSaving}
                >
                  Reset
                </button>
                <button className="primary-btn" type="submit" disabled={notificationSaving}>
                  {notificationSaving ? 'Saving…' : 'Save settings'}
                </button>
              </div>
              {notificationMessage && <div className="auth-message">{notificationMessage}</div>}
            </form>
          </section>
        </main>
      ) : (
        <main className="page">


          <section className="content">
            {loading && <div className="panel">Loading cases…</div>}
            {error && (
              <div className="panel notice">
                <div className="notice-title">Error loading cases</div>
                <p>{error}</p>
              </div>
            )}
            {!loading && !error && (
              <CaseTable
                cases={tableCases}
                page={tablePage}
                pageSize={tablePageSize}
                totalCount={filtered.length}
                onPageChange={handleTablePageChange}
                onOpen={(id) => { navigateTo(`/cases/${id}`); window.history.replaceState({ ...window.history.state, fromCaseList: true }, '', window.location.href) }}
              />
            )}
          </section>
        </main>
      )}

      </div>
    </div>
  )
}

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M10 4a6 6 0 1 1-3.16 11.08l-2.93 2.93-1.06-1.06 2.93-2.93A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
    />
  </svg>
)


export default App
