// AuthContext — React equivalent of authStateProvider + ensureUserDocProvider
// from lib/providers/auth_provider.dart. The provider:
//   • subscribes to Firebase auth state changes
//   • lazily creates the Firestore user doc on first sign-in
//   • exposes { user, profile, loading } to consumers via useAuth()
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { subscribeAuthState } from './auth.js'
import { ensureUserDoc } from './firestore.js'

const AuthContext = createContext({ user: null, profile: null, loading: true })

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    console.log('[AuthContext] subscribing to auth state')

    // Safety net: on iOS Capacitor WKWebView, Firebase's auth-state init
    // has been observed to hang silently (never invokes the callback).
    // If we don't hear from it within 8 seconds, force-exit the splash
    // so the user lands on the login screen rather than an infinite
    // loading spinner.
    const safetyTimer = setTimeout(() => {
      if (!cancelled && loadingRef.current) {
        console.warn('[AuthContext] auth init exceeded 8 s — releasing splash to login')
        setLoading(false)
      }
    }, 8000)

    const unsub = subscribeAuthState(async (fbUser) => {
      if (cancelled) return
      console.log('[AuthContext] auth state changed, uid=', fbUser?.uid || '(none)')
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
      if (!cancelled) {
        console.log('[AuthContext] loading=false')
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
      clearTimeout(safetyTimer)
      try { unsub() } catch {}
    }
  }, [])

  // Mirror loading into a ref so the safety timer can read the latest
  // value without re-binding the effect on every render.
  const loadingRef = useRef(true)
  useEffect(() => { loadingRef.current = loading }, [loading])

  return (
    <AuthContext.Provider value={{ user, profile, loading, setProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
