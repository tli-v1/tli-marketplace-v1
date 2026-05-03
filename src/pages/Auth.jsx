import { useState } from 'react'
import { signInWithPassword, signUp } from '../api/auth'
import '../App.css'

const Auth = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    if (mode === 'signup') {
      const { error } = await signUp({ email, password })
      if (error) {
        setMessage(`Signup failed: ${error.message}`)
      } else {
        setMessage('Check your email to confirm your account.')
      }
    } else {
      const { error } = await signInWithPassword({ email, password })
      if (error) {
        setMessage(`Sign in failed: ${error.message}`)
      } else {
        setMessage('Signed in.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-head">
          <div>
            <div className="auth-title">{mode === 'signup' ? 'Create account' : 'Sign in'}</div>
            <div className="auth-sub">Email/password</div>
          </div>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Working…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
          </button>
        </form>
        <button
          className="desc-toggle"
          type="button"
          onClick={() => setMode((prev) => (prev === 'signup' ? 'signin' : 'signup'))}
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
        {message && <div className="auth-message">{message}</div>}
      </div>
    </div>
  )
}

export default Auth
