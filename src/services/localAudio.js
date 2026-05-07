// On-device audio store — IndexedDB-backed persistence for the WAV blobs we
// produce after a recording stops. Per the project decision (May 2026), we
// keep audio bytes off the cloud and only persist transcripts/metadata to
// Firestore. The DB is per-origin, so audio survives reloads but stays
// private to the device.
//
// Storage layout:
//   DB:    'sheen-audio'
//   Store: 'recordings'  → key = sessionId, value = { blob, durationSec, sampleRate, savedAt }
//
// Public API:
//   saveAudio(sessionId, blob, meta?)       → Promise<void>
//   getAudioUrl(sessionId)                  → Promise<string|null>   (blob: URL — caller may URL.revokeObjectURL when done)
//   getAudioMeta(sessionId)                 → Promise<{ durationSec, sampleRate, savedAt, sizeBytes }|null>
//   deleteAudio(sessionId)                  → Promise<void>
//   listAudio()                             → Promise<string[]>      (sessionIds)
//
// PCM → WAV helper:
//   encodeWav(int16Chunks, sampleRate)      → Blob

const DB_NAME = 'sheen-audio'
const DB_VERSION = 1
const STORE = 'recordings'

let dbPromise = null

const openDb = () => {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB not available in this environment'))
    return dbPromise
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB blocked — close other tabs of this app'))
  })
  return dbPromise
}

const tx = async (mode) => {
  const db = await openDb()
  return db.transaction(STORE, mode).objectStore(STORE)
}

// ── PCM → WAV encoder ───────────────────────────────────────────────────
// Takes an array of Int16Array chunks (LE) at `sampleRate` and produces a
// 16-bit mono PCM WAV file (RIFF) suitable for an <audio> element.
export const encodeWav = (int16Chunks, sampleRate) => {
  const totalSamples = int16Chunks.reduce((n, c) => n + c.length, 0)
  const dataBytes = totalSamples * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view   = new DataView(buffer)

  // RIFF header.
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)            // fmt chunk size
  view.setUint16(20, 1, true)             // PCM
  view.setUint16(22, 1, true)             // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)// byte rate (sr * blockAlign)
  view.setUint16(32, 2, true)             // block align
  view.setUint16(34, 16, true)            // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataBytes, true)

  // PCM body.
  let offset = 44
  for (const chunk of int16Chunks) {
    for (let i = 0; i < chunk.length; i++, offset += 2) {
      view.setInt16(offset, chunk[i], true)
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

// ── CRUD ─────────────────────────────────────────────────────────────────
export const saveAudio = (sessionId, blob, meta = {}) => new Promise((resolve, reject) => {
  if (!sessionId || !(blob instanceof Blob)) return reject(new Error('saveAudio: sessionId and Blob required'))
  openDb().then(db => {
    const t = db.transaction(STORE, 'readwrite')
    const s = t.objectStore(STORE)
    s.put({
      blob,
      durationSec: Number.isFinite(meta.durationSec) ? meta.durationSec : 0,
      sampleRate:  Number.isFinite(meta.sampleRate)  ? meta.sampleRate  : null,
      savedAt:     Date.now(),
    }, sessionId)
    t.oncomplete = () => resolve()
    t.onerror    = () => reject(t.error)
  }).catch(reject)
})

export const getAudioUrl = async (sessionId) => {
  if (!sessionId) return null
  try {
    const store = await tx('readonly')
    return await new Promise((resolve, reject) => {
      const req = store.get(sessionId)
      req.onsuccess = () => {
        const rec = req.result
        if (!rec || !rec.blob) return resolve(null)
        try { resolve(URL.createObjectURL(rec.blob)) }
        catch (e) { reject(e) }
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[localAudio] getAudioUrl failed:', e?.message)
    return null
  }
}

export const getAudioMeta = async (sessionId) => {
  if (!sessionId) return null
  try {
    const store = await tx('readonly')
    return await new Promise((resolve, reject) => {
      const req = store.get(sessionId)
      req.onsuccess = () => {
        const rec = req.result
        if (!rec) return resolve(null)
        resolve({
          durationSec: rec.durationSec ?? 0,
          sampleRate:  rec.sampleRate  ?? null,
          savedAt:     rec.savedAt     ?? null,
          sizeBytes:   rec.blob?.size  ?? 0,
        })
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export const deleteAudio = async (sessionId) => {
  if (!sessionId) return
  try {
    const store = await tx('readwrite')
    await new Promise((resolve, reject) => {
      const req = store.delete(sessionId)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[localAudio] deleteAudio failed:', e?.message)
  }
}

export const listAudio = async () => {
  try {
    const store = await tx('readonly')
    return await new Promise((resolve, reject) => {
      const req = store.getAllKeys()
      req.onsuccess = () => resolve(Array.from(req.result || []))
      req.onerror   = () => reject(req.error)
    })
  } catch {
    return []
  }
}
