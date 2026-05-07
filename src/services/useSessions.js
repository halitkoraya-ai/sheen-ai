// React equivalent of allUserSessionsProvider from
// lib/providers/session_provider.dart. Subscribes to /sessions filtered by
// the current user and returns { sessions, loading, error }.
import { useEffect, useState } from 'react'
import { subscribeUserSessions } from './firestore.js'
import { useAuth } from './AuthContext.jsx'

export const useSessions = () => {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!user) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeUserSessions(
      user.uid,
      (list) => { setSessions(list); setLoading(false); setError(null) },
      (err)  => { console.error('[useSessions] stream error:', err); setError(err); setLoading(false) },
    )
    return unsub
  }, [user?.uid])

  return { sessions, loading, error }
}
