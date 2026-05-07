// Firestore user + sessions service — minimal mirror of
// lib/services/firestore_service.dart covering the operations the UI needs.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { firestore } from './firebase.js'

const userDoc = (uid) => doc(firestore, 'users', uid)

// ── User profile ────────────────────────────────────────────────────
export const getUser = async (uid) => {
  const snap = await getDoc(userDoc(uid))
  return snap.exists() ? { uid, ...snap.data() } : null
}

// Builds the default user document — matches UserModel defaults in
// lib/models/user_model.dart and the writes in ensureUserDocProvider.
export const buildDefaultUser = ({ uid, email = '', displayName = '' }) => ({
  email,
  displayName,
  country: null,
  age: null,
  occupation: null,
  major: null,
  onboardingCompleted: false,
  defaultSourceLanguage: 'en',
  defaultTargetLanguage: 'tr',
  audioQuality: 'high',
  noDataRetention: false,
  analyticsEnabled: true,
  recentListMode: 'recorded',
  tier: 'free',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

export const createUser = (uid, data) =>
  setDoc(userDoc(uid), data)

// Idempotent: creates the user doc on first sign-in, no-op afterwards.
// Mirrors ensureUserDocProvider in lib/providers/auth_provider.dart.
export const ensureUserDoc = async (user) => {
  if (!user?.uid) return null
  const existing = await getUser(user.uid)
  if (existing) return existing
  const data = buildDefaultUser({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
  })
  await createUser(user.uid, data)
  return { uid: user.uid, ...data }
}

// Onboarding: country/age/occupation/major + flips onboardingCompleted to true.
export const updateOnboardingProfile = async (uid, { country, age, occupation, major }) => {
  const data = {
    onboardingCompleted: true,
    updatedAt: serverTimestamp(),
  }
  if (country    != null) data.country    = country
  if (age        != null) data.age        = age
  if (occupation != null) data.occupation = occupation
  if (major      != null) data.major      = major
  await setDoc(userDoc(uid), data, { merge: true })
}

// Generic merge update — keeps parity with FirestoreService.updateUser.
export const updateUser = (uid, data) =>
  setDoc(userDoc(uid), { ...data, updatedAt: serverTimestamp() }, { merge: true })

// ── Display helpers ──────────────────────────────────────────────────
// Tier id → display label. The four canonical tiers are
// free / advance / premium / professional. The legacy aliases are kept
// so existing user docs (basic / pro / unlimited) still render sensibly
// until they're migrated.
export const TIER_LABEL = {
  free:         'Free',
  advance:      'Advance',
  premium:      'Premium',
  professional: 'Professional',
  // legacy
  basic:        'Free',
  pro:          'Professional',
  unlimited:    'Professional',
}
export const tierLabel = (tier) => TIER_LABEL[tier] || 'Free'

// Common UI language codes used by the recording/translation flow.
// Order mirrors the Flutter language picker.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
]
export const languageLabel = (code) =>
  SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || (code || '').toUpperCase()

// ── Sessions ─────────────────────────────────────────────────────────
// Sessions live at top-level /sessions/{id} (per firestore.rules), filtered
// by userId. Mirrors streamUserSessions / getSession / updateSession /
// deleteSession in lib/services/firestore_service.dart.

const sessionDoc = (id) => doc(firestore, 'sessions', id)
const sessionsCol = () => collection(firestore, 'sessions')

const tsToDate = (ts) => {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date(ts)
}

// Convert Firestore session document to a UI-friendly plain object.
const sessionFromDoc = (id, data) => ({
  id,
  userId:           data.userId           || '',
  title:            data.title            || '',
  status:           data.status           || 'completed',
  duration:         data.duration         || 0,
  speakerCount:     data.speakerCount     || 0,
  speakerNames:     data.speakerNames     || {},
  isStarred:        !!data.isStarred,
  bookmarks:        Array.isArray(data.bookmarks) ? data.bookmarks : [],
  aiQueriesUsed:    data.aiQueriesUsed    || 0,
  audioStoragePath: data.audioStoragePath || null,
  // Pointer into the on-device IndexedDB-backed audio store. Set by the
  // recording flow once a WAV has been encoded and persisted locally.
  // Audio bytes themselves are NOT in Firestore — only this reference key.
  localAudioId:     data.localAudioId     || null,
  sourceLanguage:   data.sourceLanguage   || 'en',
  targetLanguage:   data.targetLanguage   || 'en',
  createdAt:        tsToDate(data.createdAt) || new Date(),
  updatedAt:        tsToDate(data.updatedAt) || new Date(),
  lastViewedAt:     tsToDate(data.lastViewedAt),
  // AI summary cache (written by services/summary.js after a successful generation).
  summary:          data.summary || null,
  summaryGeneratedAt: tsToDate(data.summaryGeneratedAt),
})

// Live subscription. Returns an unsubscribe function.
export const subscribeUserSessions = (uid, onChange, onError) => {
  if (!uid) return () => {}
  const q = query(
    sessionsCol(),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(d => sessionFromDoc(d.id, d.data()))),
    (err)  => onError?.(err),
  )
}

export const getSession = async (sessionId) => {
  if (!sessionId) return null
  const snap = await getDoc(sessionDoc(sessionId))
  return snap.exists() ? sessionFromDoc(sessionId, snap.data()) : null
}

export const updateSession = (sessionId, data) =>
  updateDoc(sessionDoc(sessionId), { ...data, updatedAt: serverTimestamp() })

export const renameSession = (sessionId, title) =>
  updateSession(sessionId, { title })

// Bumps lastViewedAt. The "Recently viewed" sort in the Flutter app uses this.
export const markSessionViewed = (sessionId) =>
  updateSession(sessionId, { lastViewedAt: serverTimestamp() })

// Top-level delete only — segments/chatMessages cleanup ideally happens via
// a Cloud Function. For the UI flow we delete the session doc; orphaned
// subcollection docs can be cleaned up server-side.
export const deleteSession = (sessionId) =>
  deleteDoc(sessionDoc(sessionId))

// Create a session — used by the recording flow (and dev/testing). Returns
// the new session ID. Mirrors createSession in lib/services/firestore_service.dart.
import { addDoc, writeBatch } from 'firebase/firestore'
export const createSession = async (uid, partial = {}) => {
  if (!uid) throw new Error('createSession: uid required')
  const now = new Date()
  const data = {
    userId: uid,
    title: partial.title || 'Untitled recording',
    status: partial.status || 'completed',
    duration: partial.duration || 0,
    speakerCount: partial.speakerCount || 0,
    speakerNames: partial.speakerNames || {},
    isStarred: !!partial.isStarred,
    bookmarks: partial.bookmarks || [],
    aiQueriesUsed: 0,
    audioStoragePath: partial.audioStoragePath || null,
    sourceLanguage: partial.sourceLanguage || 'en',
    targetLanguage: partial.targetLanguage || 'en',
    createdAt: partial.createdAt || now,
    updatedAt: serverTimestamp(),
  }
  const ref = await addDoc(sessionsCol(), data)
  return ref.id
}

// Batch-write a list of segments under a session. Mirrors batchWriteSegments
// in lib/services/firestore_service.dart.
export const batchWriteSegments = async (sessionId, segments) => {
  if (!sessionId || !Array.isArray(segments) || segments.length === 0) return
  const batch = writeBatch(firestore)
  const segCol = collection(firestore, 'sessions', sessionId, 'segments')
  for (const s of segments) {
    const ref = doc(segCol)
    batch.set(ref, {
      speakerIndex:   s.speakerIndex   || 0,
      originalText:   s.originalText   || '',
      translatedText: s.translatedText || null,
      isFinal:        !!s.isFinal,
      startTime:      s.startTime      || 0,
      endTime:        s.endTime        || 0,
      order:          s.order          || 0,
    })
  }
  await batch.commit()
}

// Subscribe to a session's segments subcollection ordered by `order` (or
// startTime as a tie-break). Used by the meeting-detail screen to render the
// real transcript instead of the design-mock dialogue.
export const subscribeSegments = (sessionId, onChange, onError) => {
  if (!sessionId) return () => {}
  const col = collection(firestore, 'sessions', sessionId, 'segments')
  const q   = query(col, orderBy('order', 'asc'))
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map(d => {
      const data = d.data() || {}
      return {
        id:             d.id,
        speakerIndex:   data.speakerIndex   || 0,
        originalText:   data.originalText   || '',
        translatedText: data.translatedText || null,
        isFinal:        !!data.isFinal,
        startTime:      Number(data.startTime || 0),
        endTime:        Number(data.endTime   || 0),
        order:          Number(data.order     || 0),
      }
    })),
    (err) => onError?.(err),
  )
}

// Convenience: finalize a session after recording stops.
export const finalizeSession = (sessionId, { duration, speakerCount, status = 'completed', title } = {}) => {
  const data = { status }
  if (Number.isFinite(duration))     data.duration     = duration
  if (Number.isFinite(speakerCount)) data.speakerCount = speakerCount
  if (typeof title === 'string' && title.length) data.title = title
  return updateSession(sessionId, data)
}
