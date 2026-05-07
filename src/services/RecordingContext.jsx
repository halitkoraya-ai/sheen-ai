// RecordingContext — React equivalent of recordingProvider in
// lib/providers/recording_provider.dart. Coordinates AudioCapture,
// WebSocketClient, and Firestore so the UI just calls start/pause/stop and
// observes state. Falls back to "offline mode" if the streaming server can't
// be reached so the user always gets a session record.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { auth } from './firebase.js'
import { useAuth } from './AuthContext.jsx'
import { AudioCapture } from './audioCapture.js'
import { WebSocketClient, ConnectionState } from './websocket.js'
import { createSession, batchWriteSegments, finalizeSession, updateSession } from './firestore.js'
import { encodeWav, saveAudio } from './localAudio.js'

export const RecordingState = Object.freeze({
  Idle:       'idle',
  Connecting: 'connecting',
  Recording:  'recording',
  Paused:     'paused',
  Stopping:   'stopping',
  Completed:  'completed',
  Failed:     'failed',
})

const DEFAULT_SAMPLE_RATE = 16000

const RecordingContext = createContext(null)

export const RecordingProvider = ({ children }) => {
  const { user, profile } = useAuth()

  // ── Public state ────────────────────────────────────────────────────
  const [recState, setRecState]         = useState(RecordingState.Idle)
  const [sessionId, setSessionId]       = useState(null)
  const [partial, setPartial]           = useState(null)   // current non-final segment
  const [segments, setSegments]         = useState([])     // final segments (in-memory)
  const [elapsed, setElapsed]           = useState(0)      // seconds
  const [amplitude, setAmplitude]       = useState(0)
  const [connection, setConnection]     = useState(ConnectionState.Disconnected)
  const [offlineMode, setOfflineMode]   = useState(false)
  const [error, setError]               = useState(null)

  // ── Refs (don't trigger renders) ─────────────────────────────────────
  const captureRef    = useRef(null)
  const wsRef         = useRef(null)
  const elapsedTimer  = useRef(null)
  const flushTimer    = useRef(null)
  const orderRef      = useRef(0)
  const speakersRef   = useRef(new Set())
  const pendingRef    = useRef([])      // unpersisted final segments
  const sessionIdRef  = useRef(null)    // mirror of sessionId for callbacks
  const startedAtRef  = useRef(0)
  const pausedAtRef   = useRef(null)
  const pausedTotalMs = useRef(0)
  // Raw PCM buffer for the local-audio save. We hold the Int16 chunks the
  // capture node hands us and concatenate at stop time, so we never have to
  // pay for a re-encode mid-recording. Keeping each chunk as its own typed
  // array avoids the worst-case copies; a 30-min 16 kHz mono session is
  // ~57 MB which IndexedDB handles fine.
  const pcmChunksRef  = useRef([])
  const pcmBytesRef   = useRef(0)

  const isPaused     = recState === RecordingState.Paused
  const isRecording  = recState === RecordingState.Recording
  const isActive     = isRecording || isPaused || recState === RecordingState.Connecting || recState === RecordingState.Stopping

  // ── Helpers ─────────────────────────────────────────────────────────
  const stopElapsedTimer = () => {
    if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null }
  }
  const startElapsedTimer = () => {
    stopElapsedTimer()
    elapsedTimer.current = setInterval(() => {
      const now = Date.now()
      const ms  = now - startedAtRef.current - pausedTotalMs.current - (pausedAtRef.current ? (now - pausedAtRef.current) : 0)
      setElapsed(Math.max(0, Math.floor(ms / 1000)))
    }, 250)
  }

  const flushPending = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid || pendingRef.current.length === 0) return
    const batch = pendingRef.current.splice(0)
    try {
      await batchWriteSegments(sid, batch)
    } catch (e) {
      console.error('[RecordingContext] flushPending failed', e)
      // Re-queue on failure (simple — could grow unbounded; fine for MVP).
      pendingRef.current.unshift(...batch)
    }
  }, [])

  const onTranscript = useCallback((msg) => {
    if (msg?.type !== 'transcript') return
    const seg = {
      id:             msg.id || `seg-${Date.now()}`,
      speakerIndex:   msg.speakerIndex   || 0,
      originalText:   msg.originalText   || '',
      translatedText: msg.translatedText || null,
      isFinal:        !!msg.isFinal,
      startTime:      Number(msg.startTime || 0),
      endTime:        Number(msg.endTime   || 0),
      order:          Number.isFinite(msg.order) ? msg.order : orderRef.current,
    }
    speakersRef.current.add(seg.speakerIndex)
    if (seg.isFinal) {
      orderRef.current += 1
      wsRef.current?.updateSegmentOrder(orderRef.current)
      setPartial(null)
      setSegments(prev => [...prev, seg])
      pendingRef.current.push(seg)
      if (pendingRef.current.length >= 10) flushPending()
    } else {
      setPartial(seg)
    }
  }, [flushPending])

  // ── Cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => () => {
    stopElapsedTimer()
    if (flushTimer.current) clearInterval(flushTimer.current)
    try { captureRef.current?.stop() } catch {}
    try { wsRef.current?.disconnect() } catch {}
  }, [])

  // ── Public API ──────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (isActive) return
    if (!user) { setError('You must be signed in to record.'); return }
    setError(null)
    setSegments([])
    setPartial(null)
    setElapsed(0)
    setAmplitude(0)
    setOfflineMode(false)
    speakersRef.current.clear()
    pendingRef.current = []
    orderRef.current = 0
    pausedTotalMs.current = 0
    pausedAtRef.current = null
    pcmChunksRef.current = []
    pcmBytesRef.current  = 0

    setRecState(RecordingState.Connecting)

    // Sample rate from user pref (or default).
    const sampleRate = profile?.audioQuality === 'high' ? 48000 : DEFAULT_SAMPLE_RATE

    let createdSessionId = null
    try {
      // 1) Mic capture FIRST — fails fast on permission denied without leaving
      //    an orphaned session doc behind.
      const cap = new AudioCapture({ sampleRate })
      cap.onChunk = (chunk) => {
        // Forward to the streaming server for transcription…
        wsRef.current?.sendAudio(chunk)
        // …and stash the chunk for our local WAV. AudioCapture allocates a
        // fresh Int16Array per frame so we can hold the reference without
        // a copy; the WebSocket only reads the underlying buffer.
        pcmChunksRef.current.push(chunk)
        pcmBytesRef.current += chunk.byteLength
      }
      cap.onAmplitude = (a) => setAmplitude(a)
      cap.onError = (err) => { console.error('[RecordingContext] capture error', err); setError(err.message || String(err)) }
      await cap.start()
      captureRef.current = cap

      // 2) Firestore session doc.
      createdSessionId = await createSession(user.uid, {
        title:          `Recording ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        status:         'recording',
        sourceLanguage: profile?.defaultSourceLanguage || 'en',
        targetLanguage: profile?.defaultTargetLanguage || 'en',
      })
      sessionIdRef.current = createdSessionId
      setSessionId(createdSessionId)

      // 3) WebSocket — best-effort. Fall back to offline mode on failure.
      let token = ''
      try { token = (await auth.currentUser?.getIdToken()) || '' } catch {}

      const ws = new WebSocketClient()
      ws.onTranscript      = onTranscript
      ws.onConnectionState = (s) => setConnection(s)
      ws.onError           = (e) => console.warn('[ws]', e?.message || e)
      try {
        await ws.connect({
          authToken:      token,
          sourceLanguage: profile?.defaultSourceLanguage || 'en',
          targetLanguage: profile?.defaultTargetLanguage || 'en',
          sampleRate,
          startingSegmentOrder: 0,
          timeoutMs: 5000,
        })
        wsRef.current = ws
        // Periodic Firestore flush.
        if (flushTimer.current) clearInterval(flushTimer.current)
        flushTimer.current = setInterval(flushPending, 30_000)
      } catch (e) {
        console.warn('[RecordingContext] WS connect failed → offline mode:', e?.message || e)
        try { ws.disconnect() } catch {}
        wsRef.current = null
        setOfflineMode(true)
        setConnection(ConnectionState.Disconnected)
      }

      startedAtRef.current = Date.now()
      startElapsedTimer()
      setRecState(RecordingState.Recording)
    } catch (e) {
      console.error('[RecordingContext] start failed', e)
      // Friendlier message for the most common case: blocked mic permission.
      const msg = e?.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser to record.'
        : (e?.message || String(e))
      setError(msg)
      setRecState(RecordingState.Failed)
      try { captureRef.current?.stop() } catch {}
      captureRef.current = null
      try { wsRef.current?.disconnect() } catch {}
      wsRef.current = null
      // Best-effort: mark the half-created session as failed.
      if (createdSessionId) {
        try { await finalizeSession(createdSessionId, { status: 'failed' }) } catch {}
      }
      // Auto-clear the failed state so the next tap can retry.
      setTimeout(() => {
        setRecState(prev => prev === RecordingState.Failed ? RecordingState.Idle : prev)
      }, 50)
    }
  }, [isActive, user, profile, onTranscript, flushPending])

  const pause = useCallback(() => {
    if (recState !== RecordingState.Recording) return
    captureRef.current?.pause()
    pausedAtRef.current = Date.now()
    stopElapsedTimer()
    setRecState(RecordingState.Paused)
  }, [recState])

  const resume = useCallback(() => {
    if (recState !== RecordingState.Paused) return
    if (pausedAtRef.current) {
      pausedTotalMs.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
    captureRef.current?.resume()
    startElapsedTimer()
    setRecState(RecordingState.Recording)
  }, [recState])

  const stop = useCallback(async () => {
    if (recState === RecordingState.Idle || recState === RecordingState.Stopping) return
    setRecState(RecordingState.Stopping)
    stopElapsedTimer()
    if (flushTimer.current) { clearInterval(flushTimer.current); flushTimer.current = null }

    // Compute final duration before tearing things down.
    const now = Date.now()
    const ms  = now - startedAtRef.current - pausedTotalMs.current - (pausedAtRef.current ? (now - pausedAtRef.current) : 0)
    const durationSec = Math.max(0, Math.floor(ms / 1000))

    try { await captureRef.current?.stop() } catch {}
    captureRef.current = null

    try { wsRef.current?.sendStop() } catch {}
    try { wsRef.current?.disconnect() } catch {}
    wsRef.current = null

    // Flush any remaining segments + finalize the session doc.
    const sid = sessionIdRef.current
    try { await flushPending() } catch {}

    // Encode the captured PCM into a WAV blob and persist it on-device via
    // IndexedDB. We do NOT upload audio to cloud Storage — per project
    // decision (May 2026) audio stays local. The session doc gets a
    // localAudioId pointer so the detail screen knows where to look.
    const sampleRate = profile?.audioQuality === 'high' ? 48000 : DEFAULT_SAMPLE_RATE
    let localAudioSaved = false
    try {
      if (sid && pcmChunksRef.current.length > 0) {
        const wav = encodeWav(pcmChunksRef.current, sampleRate)
        await saveAudio(sid, wav, { durationSec, sampleRate })
        localAudioSaved = true
      }
    } catch (e) {
      console.error('[RecordingContext] saveAudio failed', e)
    } finally {
      // Drop the PCM references so we don't keep tens of MB live in memory.
      pcmChunksRef.current = []
      pcmBytesRef.current  = 0
    }

    if (sid) {
      try {
        await finalizeSession(sid, {
          status: 'completed',
          duration: durationSec,
          speakerCount: speakersRef.current.size,
        })
        if (localAudioSaved) {
          // Mark which device-local audio key the detail screen should look
          // up. We don't store the bytes on the doc — just a pointer.
          try { await updateSession(sid, { localAudioId: sid }) }
          catch (e) { console.warn('[RecordingContext] localAudioId mark failed', e?.message) }
        }
      } catch (e) {
        console.error('[RecordingContext] finalizeSession failed', e)
      }
    }

    setRecState(RecordingState.Completed)
    sessionIdRef.current = null
    pausedAtRef.current = null
    pausedTotalMs.current = 0
    // Settle to idle so the UI can start fresh next time.
    setTimeout(() => {
      setRecState(prev => prev === RecordingState.Completed ? RecordingState.Idle : prev)
      setSessionId(null)
      setPartial(null)
      setSegments([])
      setElapsed(0)
      setAmplitude(0)
    }, 200)
  }, [recState, flushPending])

  const reset = useCallback(() => {
    setRecState(RecordingState.Idle)
    setError(null)
  }, [])

  const value = {
    state: recState,
    sessionId,
    elapsed,
    amplitude,
    partial,
    segments,
    connection,
    offlineMode,
    error,
    isRecording,
    isPaused,
    isActive,
    start,
    pause,
    resume,
    stop,
    reset,
  }
  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
}

export const useRecording = () => {
  const ctx = useContext(RecordingContext)
  if (!ctx) throw new Error('useRecording must be used within RecordingProvider')
  return ctx
}
