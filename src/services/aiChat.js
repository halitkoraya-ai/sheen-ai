// Wrapper around the deployed `aiChat` Cloud Function (Firebase httpsCallable).
//
// The function takes a session id + user message, attaches the session's
// transcript as context, calls DeepSeek, persists both turns to
// `sessions/{sid}/chatMessages`, and returns the assistant reply along with
// the user's running quota counters.
//
// Tier routing — the client passes the tier-allowed model list and the
// `autoRoute` flag; the function defaults to DeepSeek V3 (chat) and only
// escalates to R1 (reasoner) when a regex heuristic flags the prompt as
// genuinely complex AND the tier allows R1 (Premium / Professional with
// autoRoute on). Free-tier users never reach this entry point.
import { httpsCallable } from 'firebase/functions'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { firestore, functions } from './firebase.js'

// Subscribe to chat messages for a session. Returns an unsubscribe.
export const subscribeChatMessages = (sessionId, onChange, onError) => {
  if (!sessionId) return () => {}
  const col = collection(firestore, 'sessions', sessionId, 'chatMessages')
  const q   = query(col, orderBy('createdAt', 'asc'))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(d => {
      const data = d.data() || {}
      return {
        id:        d.id,
        role:      data.role || 'assistant',
        content:   data.content || '',
        createdAt: data.createdAt?.toDate?.() || new Date(),
        referencedTimestamps: Array.isArray(data.referencedTimestamps) ? data.referencedTimestamps : [],
      }
    })),
    (err) => onError?.(err),
  )
}

// Send a chat message. `options` carries the tier's routing config.
//   { models: ['v3'] | ['v3','r1'], autoRoute: bool, priority: bool }
// Returns { queriesUsed, queryLimit, modelUsed }.
export const sendAiMessage = async ({ sessionId, message, options = {} }) => {
  if (!sessionId) throw new Error('sendAiMessage: sessionId required')
  if (!message?.trim()) throw new Error('sendAiMessage: message required')
  const callable = httpsCallable(functions, 'aiChat')
  const res = await callable({
    sessionId,
    message: message.trim(),
    // The Cloud Function reads these and decides routing. Older deployments
    // ignore unknown fields, so we can ship this client ahead of the server
    // change without breaking anything.
    models:    options.models    || ['v3'],
    autoRoute: options.autoRoute || false,
    priority:  options.priority  || false,
  })
  const data = res.data || {}
  return {
    queriesUsed: Number(data.queriesUsed || 0),
    queryLimit:  Number(data.queryLimit  || -1),
    modelUsed:   String(data.modelUsed   || 'v3'),
  }
}

// Pull [MM:SS] / [MM:SS:SS] timestamps out of an assistant message body
// for jump-to-time chips. Used by the UI to render scrubbable references.
export const extractTimestamps = (text) => {
  if (!text) return []
  const re = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g
  const out = []
  let m
  while ((m = re.exec(text)) !== null) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    const c = m[3] ? parseInt(m[3], 10) : null
    out.push(c == null ? a * 60 + b : a * 3600 + b * 60 + c)
  }
  return out
}
