export const getSession = () => Promise.resolve({ data: { session: null }, error: null })
export const onAuthStateChange = (handler) => ({ data: { subscription: { unsubscribe: () => {} } } })
export const signInWithPassword = ({ email, password }) => Promise.resolve({ data: null, error: null })
export const signUp = ({ email, password }) => Promise.resolve({ data: null, error: null })
export const signOut = () => Promise.resolve({ error: null })
export const getUser = () => Promise.resolve({ data: { user: null }, error: null })

export const checkLawyerAccess = async (userId) => {
  return { isAuthorized: false, error: null }
}
