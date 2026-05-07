// AuthContext — React equivalent of authStateProvider + ensureUserDocProvider
// from lib/providers/auth_provider.dart. The provider:
//   • subscribes to Firebase auth state changes
//   • lazily creates the Firestore user doc on first sign-in
//   • exposes { user, profile, loading } to consumers via useAuth()
import { createContext, useContext, useEffect, useState } from 'react'
import { subscribeAuthState } from './auth.js'
import { ensureUserDoc } from './firestore.js'

const AuthContext = createContext({ user: null, profile: null, loading: true })

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const unsub = subscribeAuthState(async (fbUser) => {
      if (cancelled) return
      setUser(fbUser)
      if (fbUser) {
        try {
          const doc = await ensureUserDoc(fbUser)
          if (!cancelled) setProfile(doc)
        } catch (e) {
          console.error('[AuthContext] ensureUserDoc failed:', e)
          if (!cancelled) setProfile(null)
        }
      } else {
        setProfile(null)
      }
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true; unsub() }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
