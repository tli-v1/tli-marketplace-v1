import { useState } from 'react'

const Icon = ({ path }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>

export default function WorkspaceSidebar({ caseId, isSettings, isAdmin, canAdmin, adminUrl, navigate, onSignOut, signingOut, email, filters }) {
  const [section, setSection] = useState('incident')
  const link = (event, path) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(path)
  }
  return (
    <aside className="workspace-sidebar" aria-label="Marketplace navigation">
      <a className="workspace-brand" href="/" onClick={event => link(event, '/')}>
        <img src="/tli_logo.png" alt="" /><span>True Legal<br />Innovations</span>
      </a>
      <span className="workspace-caption">Lawyer workspace</span>
      <nav aria-label="Workspace">
        <a href="/" onClick={event => link(event, '/')} aria-current={!isSettings && !isAdmin && !caseId ? 'page' : undefined}>
          <Icon path="M3 7V5h7l2 2h9v13H3V7Z" />All cases
        </a>
        <a href="/settings" onClick={event => link(event, '/settings')} aria-current={isSettings ? 'page' : undefined}>
          <Icon path="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-3a8 8 0 0 1 16 0v3" />Profile & alerts
        </a>
        {canAdmin && <a href={adminUrl || '/admin'} onClick={adminUrl ? undefined : event => link(event, '/admin')} aria-current={isAdmin ? 'page' : undefined}>
          <Icon path="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />Administration
        </a>}
      </nav>
      {filters}
      {caseId && <div className="workspace-case-nav">
        <span className="workspace-caption">Case review</span>
        <nav aria-label="Case sections">
          {Object.entries({ incident: 'Incident & contact', damages: 'Damages', parties: 'Parties & insurance', documents: 'Files & evidence', agreement: 'Lawyer-client agreement' }).map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={event => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              setSection(id)
              document.getElementById(id)?.scrollIntoView({ block: 'start' })
              window.history.replaceState(window.history.state, '', `#${id}`)
            }} aria-current={section === id ? 'location' : undefined}>{label}</a>
          ))}
        </nav>
      </div>}
      <div className="workspace-account">
        <span title={email}>{email}</span>
        <button type="button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}<Icon path="M9 4H4v16h5m6-12 4 4-4 4m-7-4h11" />
        </button>
      </div>
    </aside>
  )
}
