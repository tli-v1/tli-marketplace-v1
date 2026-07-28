import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { auth } from '../firebase'

const INVALID_CREDENTIAL_CODES = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/user-not-found',
  'auth/wrong-password',
])

const toAuthError = (error, fallbackMessage = 'Authentication failed') => ({
  message: error?.message || fallbackMessage,
  code: error?.code,
})

const toSignInError = (error) => ({
  message: INVALID_CREDENTIAL_CODES.has(error?.code)
    ? 'Invalid username or password'
    : error?.message || 'Invalid username or password',
  code: error?.code,
})

const toUser = (user) => {
  if (!user) return null

  return {
    id: user.uid,
    email: user.email,
    uid: user.uid,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
  }
}

const toSession = async (user) => {
  if (!user) return null

  const accessToken = await user.getIdToken()
  return {
    access_token: accessToken,
    user: toUser(user),
  }
}

const waitForAuthReady = () =>
  new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe()
        resolve(user)
      },
      (error) => {
        unsubscribe()
        reject(error)
      },
    )
  })

export const getSession = async () => {
  try {
    const user = auth.currentUser || await waitForAuthReady()
    return { data: { session: await toSession(user) }, error: null }
  } catch (error) {
    return { data: { session: null }, error: toAuthError(error) }
  }
}

export const onAuthStateChange = (handler) => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    handler('auth_state_changed', await toSession(user))
  })

  return { data: { subscription: { unsubscribe } } }
}

export const signInWithPassword = async ({ email, password }) => {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return { data: { session: await toSession(credential.user), user: toUser(credential.user) }, error: null }
  } catch (error) {
    return { data: null, error: toSignInError(error) }
  }
}

export const signUp = async ({ email, password }) => {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    return { data: { session: await toSession(credential.user), user: toUser(credential.user) }, error: null }
  } catch (error) {
    return { data: null, error: toAuthError(error) }
  }
}

export const signOut = async () => {
  try {
    await firebaseSignOut(auth)
    return { error: null }
  } catch (error) {
    return { error: toAuthError(error) }
  }
}

export const getUser = () =>
  Promise.resolve({ data: { user: toUser(auth.currentUser) }, error: null })

export const checkLawyerAccess = async () => {
  try {
    const token = await auth.currentUser?.getIdTokenResult(true)
    const role = token?.claims?.role || token?.claims?.app_metadata?.role
    return { isAuthorized: role === 'lawyer', error: null }
  } catch (error) {
    return { isAuthorized: false, error: toAuthError(error) }
  }
}
