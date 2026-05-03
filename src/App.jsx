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
import CaseCard from './components/CaseCard'
import CaseDetail from './components/CaseDetail'
import StateFilter from './components/StateFilter'
import tliLogo from './assets/tli_logo.png'
import { mapCaseRow, parseValueCeiling } from './utils'
import { fetchCases } from './api/cases'
import { fetchStateCodes } from './api/stateCodes'
import { fetchMyAgreements, submitAgreement } from './api/agreements'
import { fetchUserProfile } from './api/users'
import './App.css'

const fallbackStates = ['Missouri', 'Kansas', 'Nebraska', 'Iowa']
const practiceAreas = [
  'Personal Injury',
  'Auto',
  'Premises Liability',
  'Medical Malpractice',
  'Products Liability',
  'Employment',
  'Animal Liability',
  'Workplace Safety',
]

const Checkbox = ({ label, checked, onChange }) => (
  <label className="checkbox">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span>{label}</span>
  </label>
)

function App() {
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState(new Set())
  const [practiceFilter, setPracticeFilter] = useState(new Set())
  const [sort, setSort] = useState('urgency')
  const [view, setView] = useState('grid')
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
  const [userIdentity, setUserIdentity] = useState({ displayName: '', email: '' })
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [roleChecked, setRoleChecked] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [agreementState, setAgreementState] = useState({})
  const [myAgreements, setMyAgreements] = useState({})
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const showAuth = import.meta.env.VITE_SHOW_SIGN_IN === 'true'

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
    const checkRole = async () => {
      if (!session?.user?.id) {
        setRoleChecked(false)
        setIsAuthorized(false)
        return
      }
      const cacheKey = `role-cache:${session.user.id}`
      const cachedRole = localStorage.getItem(cacheKey)
      if (cachedRole === 'lawyer') {
        setIsAuthorized(true)
        setRoleChecked(true)
        return
      }
      setRoleChecked(false)
      const { isAuthorized, error } = await checkLawyerAccess(session.user.id)
      const isLawyer = isAuthorized
      setIsAuthorized(isLawyer)
      setRoleChecked(true)
      localStorage.setItem(cacheKey, isLawyer ? 'lawyer' : 'denied')
      if (!isLawyer) {
        if (error) {
          console.error('Fetch user profile error', error)
        }
        setSignInMessage('You do not have the appropriate access to view the marketplace.')
        await signOut()
      }
    }

    checkRole()
  }, [session])

  useEffect(() => {
    const loadCases = async () => {
      setError('')
      try {
        if (!authChecked) {
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
  }, [authChecked, session, roleChecked, isAuthorized])

  useEffect(() => {
    const fetchUserIdentity = async () => {
      if (!session) {
        setUserIdentity({ displayName: '', email: '' })
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

      setUserIdentity({ displayName, email })
    }

    fetchUserIdentity()
  }, [session])

  useEffect(() => {
    const fetchMyAgreementsForUser = async () => {
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
  }, [session])

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
    () => cases.find((item) => item.id === selectedCaseId),
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
    if (sort === 'urgency') {
      sorted.sort((a, b) => a.urgencyDays - b.urgencyDays)
    } else if (sort === 'value-high') {
      sorted.sort((a, b) => parseValueCeiling(b.valueRange) - parseValueCeiling(a.valueRange))
    } else if (sort === 'recent') {
      sorted.sort((a, b) => new Date(b.incident.date) - new Date(a.incident.date))
    }

    return sorted.map((item) => ({ ...item, displayState: resolveStateLabel(item) }))
  }, [search, sort, stateFilter, practiceFilter, cases, resolveStateLabel])

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
    setSort('urgency')
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
    setSignInMessage('')
    setSignupMessage('')
    setSignInLoading(true)
    const { data, error: signInError } = await signInWithPassword({
      email: signInEmail,
      password: signInPassword,
    })
    setSignInLoading(false)

    if (signInError) {
      setSignInMessage(`Sign in failed: ${signInError.message}`)
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
            <button type="submit" disabled={signInLoading}>
              {signInLoading ? 'Signing in…' : 'Sign in'}
            </button>
            <small className="auth-hint">Access limited to authorized lawyers.</small>
          </form>
          {signInMessage && <div className="auth-message">{signInMessage}</div>}
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
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-name">
            <img src={tliLogo} alt="TLI logo" className="brand-logo" /> TLI Marketplace
          </div>
          <div className="brand-sub">
            Dashboard — {userIdentity.displayName || userIdentity.email || 'Guest'}
          </div>
          <div className="private-pill">Private lawyer-specific view</div>
        </div>
        <div className="search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by case or fact pattern…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="icon-btn" type="button" aria-label="Saved cases">
          <BookmarkIcon />
          Saved
        </button>
        <button className="icon-btn" type="button" onClick={handleSignOut} disabled={signOutLoading}>
          {signOutLoading ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <main className="page">
        <aside className="sidebar">
          <div className="panel">
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
                  <option value="urgency">SOL urgency</option>
                  <option value="recent">Most recent incident</option>
                  <option value="value-high">Value high to low</option>
                </select>
              </div>
            </div>
          </div>

          <div className="panel notice">
            <div className="notice-title">Compliance First</div>
            <p>
              Viewing gated to state licensure. Contact requires user consent and disclosures per Rules 7.2/7.3; platform logs
              all outreach.
            </p>
          </div>
        </aside>

        <section className="content">
          <div className="content-head">
            {!loading && (
              <div className="results">
                <span className="count">{filtered.length}</span>
                <span className="label">results</span>
              </div>
            )}
            <div className="view-toggle">
              <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>
                Grid
              </button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                List
              </button>
            </div>
          </div>

          {loading && <div className="panel">Loading cases…</div>}
          {error && (
            <div className="panel notice">
              <div className="notice-title">Error loading cases</div>
              <p>{error}</p>
            </div>
          )}
          {!loading && !error && (
            <div className={`cases ${view}`}>
              {filtered.map((item) => (
                <CaseCard
                  key={item.id}
                  data={item}
                  view={view}
                  agreementInfo={myAgreements[item.id]}
                  onOpen={(id) => setSelectedCaseId(id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {selectedCase && (
        <CaseDetail
          data={selectedCase}
          onClose={() => setSelectedCaseId(null)}
          onSubmitAgreement={handleSubmitAgreement}
          existingAgreement={myAgreements[selectedCase.id]}
          agreementState={agreementState[selectedCase.id] || { loading: false, message: '' }}
        />
      )}
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

const BookmarkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 3h12v18l-6-3-6 3V3Zm2 2v11.56l4-2 4 2V5H8Z"
    />
  </svg>
)

export default App
