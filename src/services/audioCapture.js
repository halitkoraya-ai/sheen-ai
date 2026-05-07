// Audio capture — browser equivalent of lib/services/recording_service.dart.
//
// Uses getUserMedia + a ScriptProcessorNode to pull raw Float32 samples,
// downsamples to the target sample rate (default 16 kHz), converts to PCM
// 16-bit little-endian, and emits chunks via a callback. Also computes an
// RMS amplitude for the live waveform.
//
// AudioWorklet would be the modern API here, but ScriptProcessor keeps the
// implementation in a single file with no extra worklet bundle — fine for
// our use case (16 kHz mono speech).

const SCRIPT_BUFFER_SIZE = 4096

// Float32 [-1, 1] → Int16 little-endian.
const floatToInt16 = (input) => {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return out
}

// Naive linear-pick decimation. Good enough for 16 kHz speech / Deepgram.
const downsample = (input, fromRate, toRate) => {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const len = Math.floor(input.length / ratio)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) out[i] = input[Math.floor(i * ratio)]
  return out
}

// RMS amplitude → 0..1, scaled like RecordingService._computeAmplitude.
const computeAmplitude = (int16) => {
  if (int16.length === 0) return 0
  let sumSq = 0
  for (let i = 0; i < int16.length; i++) sumSq += int16[i] * int16[i]
  const rms = Math.sqrt(sumSq / int16.length)
  return Math.min(1, rms / 5000)
}

export class AudioCapture {
  constructor({ sampleRate = 16000 } = {}) {
    this.sampleRate    = sampleRate
    this.audioContext  = null
    this.mediaStream   = null
    this.source        = null
    this.processor     = null
    this.recording     = false
    this.muted         = false        // pause = muted (we keep stream open)
    this.onChunk       = null         // (Int16Array) => {}
    this.onAmplitude   = null         // (number) => {}
    this.onError       = null         // (err) => {}
  }

  async start() {
    if (this.recording) return
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture not supported in this browser.')
    }
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        channelCount:     1,
      },
    })

    const AC = window.AudioContext || window.webkitAudioContext
    this.audioContext = new AC()
    const inputRate   = this.audioContext.sampleRate

    this.source = this.audioContext.createMediaStreamSource(this.mediaStream)
    // ScriptProcessorNode is deprecated but still widely supported and lets
    // us stay self-contained without shipping an AudioWorklet bundle.
    this.processor = this.audioContext.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1)

    this.processor.onaudioprocess = (e) => {
      if (!this.recording || this.muted) return
      try {
        const input = e.inputBuffer.getChannelData(0)
        const ds    = downsample(input, inputRate, this.sampleRate)
        const int16 = floatToInt16(ds)
        this.onChunk?.(int16)
        this.onAmplitude?.(computeAmplitude(int16))
      } catch (err) {
        this.onError?.(err)
      }
    }

    // ScriptProcessor needs to be in the audio graph to fire — connect to a
    // muted destination so we don't echo the mic back to the user.
    this.source.connect(this.processor)
    const muted = this.audioContext.createGain()
    muted.gain.value = 0
    this.processor.connect(muted)
    muted.connect(this.audioContext.destination)
    this._mutedGain = muted

    this.recording = true
    this.muted     = false
  }

  pause()  { this.muted = true  }
  resume() { this.muted = false }

  async stop() {
    if (!this.recording) return
    this.recording = false
    try {
      this.processor?.disconnect()
      this._mutedGain?.disconnect()
      this.source?.disconnect()
    } catch {}
    try {
      this.mediaStream?.getTracks().forEach(t => t.stop())
    } catch {}
    try {
      await this.audioContext?.close()
    } catch {}
    this.processor = null
    this.source = null
    this.mediaStream = null
    this.audioContext = null
  }
}

// Capability check — used by the UI before navigating into the recording flow.
export const hasMicSupport = () =>
  typeof navigator !== 'undefined'
  && !!navigator.mediaDevices
  && typeof navigator.mediaDevices.getUserMedia === 'function'
