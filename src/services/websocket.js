// WebSocket client — mirrors lib/services/websocket_service.dart.
//
// Sends an `auth` JSON message on connect, then streams binary PCM 16-bit
// audio chunks. Receives JSON transcript messages from the server, with
// `type: 'transcript'` events shaped like SegmentModel in the Flutter app:
//   { type, id, speakerIndex, originalText, translatedText, isFinal,
//     startTime, endTime, order }
//
// Buffers audio sent before `auth_success` so the first chunks aren't lost.

// Streaming server lives in your Cloud Run on the sheen-alpha project.
// Auth tokens issued by sheen-alpha Firebase Auth are validated by the
// server's admin.auth().verifyIdToken() — so this URL must point at the
// Cloud Run service that's deployed on the SAME Firebase project as the
// web client, otherwise every connection is rejected with auth_error.
export const STREAM_SERVER_URL = 'wss://sheen-server-176127438166.us-central1.run.app/stream'

export const ConnectionState = Object.freeze({
  Disconnected: 'disconnected',
  Connecting:   'connecting',
  Connected:    'connected',
  Reconnecting: 'reconnecting',
})

const MAX_BUFFER = 1000  // chunks buffered before auth_success

const buildAuthPayload = ({ authToken, sourceLanguage, targetLanguage, sampleRate, startingSegmentOrder = 0 }) => ({
  type: 'auth',
  token: authToken,
  sourceLanguage,
  targetLanguage,
  sampleRate,
  channels: 1,
  encoding: 'linear16',
  startingSegmentOrder,
})

export class WebSocketClient {
  constructor(url = STREAM_SERVER_URL) {
    this.url = url
    this.ws  = null
    this.authed = false
    this.connectionState = ConnectionState.Disconnected
    this._buffer = []          // pre-auth audio buffer
    this._lastOrder = 0
    this._creds = null         // last auth creds for reconnect
    this._intentionallyClosed = false
    // Listeners
    this.onTranscript      = null  // (json) => {}
    this.onConnectionState = null  // (state) => {}
    this.onError           = null  // (err) => {}
  }

  isConnected() { return this.authed && this.ws?.readyState === WebSocket.OPEN }

  _setState(s) {
    if (this.connectionState === s) return
    this.connectionState = s
    this.onConnectionState?.(s)
  }

  // Returns a Promise that resolves on `auth_success` or rejects on timeout/error.
  connect({ authToken, sourceLanguage, targetLanguage, sampleRate, startingSegmentOrder = 0, timeoutMs = 5000 }) {
    this._creds = { authToken, sourceLanguage, targetLanguage, sampleRate, startingSegmentOrder }
    this._lastOrder = startingSegmentOrder
    this._intentionallyClosed = false
    return this._open(timeoutMs)
  }

  _open(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      this._setState(ConnectionState.Connecting)
      this.authed = false
      let settled = false
      let timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { this.ws?.close() } catch {}
        reject(new Error('WebSocket connect timeout'))
      }, timeoutMs)

      try {
        this.ws = new WebSocket(this.url)
        this.ws.binaryType = 'arraybuffer'
      } catch (err) {
        clearTimeout(timer); settled = true; reject(err); return
      }

      this.ws.onopen = () => {
        try {
          this.ws.send(JSON.stringify(buildAuthPayload(this._creds)))
        } catch (err) {
          clearTimeout(timer); if (!settled) { settled = true; reject(err) }
        }
      }
      this.ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return
        let msg
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.type === 'auth_success') {
          this.authed = true
          this._setState(ConnectionState.Connected)
          this._replayBuffer()
          if (!settled) { settled = true; clearTimeout(timer); resolve() }
          return
        }
        if (msg.type === 'error') {
          this.onError?.(new Error(msg.message || 'Server error'))
          return
        }
        // Forward transcript-like events
        this.onTranscript?.(msg)
      }
      this.ws.onerror = (err) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(err) }
        this.onError?.(err)
      }
      this.ws.onclose = () => {
        this.authed = false
        if (this._intentionallyClosed) {
          this._setState(ConnectionState.Disconnected)
        } else {
          // Unexpected — caller is responsible for retrying via connect().
          this._setState(ConnectionState.Disconnected)
        }
      }
    })
  }

  // Send a PCM Int16 chunk as binary. Buffers when not yet authenticated.
  sendAudio(int16) {
    const buf = int16 instanceof Int16Array ? int16.buffer : int16
    if (this.isConnected()) {
      this.ws.send(buf)
    } else {
      if (this._buffer.length >= MAX_BUFFER) this._buffer.shift()
      this._buffer.push(buf)
    }
  }

  _replayBuffer() {
    while (this._buffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this._buffer.shift())
    }
  }

  updateSegmentOrder(order) { this._lastOrder = order }

  sendStop() {
    if (this.isConnected()) {
      try { this.ws.send(JSON.stringify({ type: 'stop' })) } catch {}
    }
  }

  disconnect() {
    this._intentionallyClosed = true
    try { this.ws?.close() } catch {}
    this.ws = null
    this.authed = false
    this._buffer = []
    this._setState(ConnectionState.Disconnected)
  }
}
