// Summary generation — fully on-device, no Claude / Anthropic call.
//
// Reads the session's transcript segments straight from Firestore and runs
// a light extractive pipeline to produce:
//   • headlines: 6–8 most "informative" sentences picked from the transcript
//                via term-frequency scoring + length heuristics.
//   • tree:      the same fixed Topic / Discussion / Decisions / Outline
//                structure the Mind Map renders, populated from speakers
//                and segments.
//
// The transcripts the streaming server (Deepgram) hands us are already
// good enough that a tiny scorer produces credible headlines without an
// LLM round trip. When server-side Deepgram `summarize=true` is enabled
// later, we can swap this implementation for one that reads the summary
// off the session doc instead.
import {
  getDocs, collection, query, orderBy,
  doc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { firestore } from './firebase.js'
import { updateSession } from './firestore.js'

// ── 1. Segment fetch ────────────────────────────────────────────────────
const fetchSegments = async (sessionId) => {
  const col  = collection(firestore, 'sessions', sessionId, 'segments')
  const q    = query(col, orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data() || {}
    return {
      speakerIndex:   Number(data.speakerIndex || 0),
      originalText:   String(data.originalText   || '').trim(),
      translatedText: String(data.translatedText || '').trim(),
      isFinal:        !!data.isFinal,
      startTime:      Number(data.startTime || 0),
      order:          Number(data.order     || 0),
    }
  })
}

// ── 2. Sentence splitter ────────────────────────────────────────────────
// Naive but works well for English-ish punctuation. Trims short fragments.
const splitSentences = (text) => {
  if (!text) return []
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZİĞÜŞÖÇЀ-ӿ])/)
    .map(s => s.trim())
    .filter(s => s.length >= 12 && s.length <= 240)
}

// ── 3. Stop words (English + Turkish — the two languages the app ships
// with by default; harmless to add more later). ─────────────────────────
const STOP = new Set([
  // english
  'the','a','an','and','or','but','if','so','to','of','in','on','at','for',
  'with','as','by','is','are','was','were','be','been','being','it','its',
  'this','that','these','those','i','we','you','they','he','she','him','her',
  'them','our','your','their','my','me','us','do','did','does','doing','have',
  'has','had','having','will','would','can','could','should','about','from',
  'into','than','then','there','here','what','which','who','whom','how','why',
  'just','also','very','too','more','most','some','any','all','each','every',
  'no','not','nor','one','two','three','really','like','well','okay','ok',
  'yeah','yes','sure','right','thing','things','stuff','something','nothing',
  // turkish
  've','ile','bir','bu','şu','o','ki','de','da','mi','mı','mu','mü','ya','yani',
  'çok','az','daha','en','gibi','için','ama','fakat','ancak','sonra','önce',
  'değil','olmak','oldu','olur','var','yok','şey','ben','sen','biz','siz',
  'onlar','şunu','bunu','onu','beni','seni','bizi','sizi','onları',
])

const tokenize = (text) =>
  (text.toLowerCase()
    .replace(/[^a-z0-9çğışöüÀ-ſ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP.has(w)))

// ── 4. Score sentences via TF (and length sweet-spot bonus) ─────────────
const scoreSentences = (sentences) => {
  // Build document term frequencies.
  const tf = new Map()
  sentences.forEach(s => {
    tokenize(s).forEach(t => tf.set(t, (tf.get(t) || 0) + 1))
  })
  return sentences.map((s) => {
    const tokens = tokenize(s)
    if (tokens.length === 0) return { s, score: 0 }
    // Sum of term frequencies normalised by token count gives short
    // information-dense sentences a fair chance vs. long padded ones.
    const tfSum = tokens.reduce((acc, t) => acc + (tf.get(t) || 0), 0)
    const base  = tfSum / Math.sqrt(tokens.length)
    // Sweet-spot bonus: 8–25 words feels "headline-shaped".
    const wc = s.split(/\s+/).length
    const lengthBonus = wc >= 8 && wc <= 25 ? 1.15 : 1
    return { s, score: base * lengthBonus }
  })
}

// ── 5. Pick top-N preserving original order ─────────────────────────────
const pickTopN = (scored, n) => {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, n)
  const keep = new Set(top.map(t => t.s))
  // Walk in original order so the headlines read like a narrative.
  return scored.filter(s => keep.has(s.s)).map(s => s.s)
}

// ── 6. Build the topic tree (Mind Map shape) ────────────────────────────
const buildTree = (segments, headlines) => {
  if (!segments.length) return []
  const speakers = Array.from(new Set(segments.map(s => s.speakerIndex))).sort((a, b) => a - b)
  // First final segment timestamp ≈ "Date" anchor.
  const startSec = segments[0]?.startTime || 0

  const tree = []
  tree.push({
    label: 'Topic',
    text: headlines[0] || 'Meeting transcript',
  })
  if (segments.length > 0) {
    tree.push({
      label: 'Date',
      text: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    })
  }
  if (speakers.length > 0) {
    tree.push({
      label: 'Attendees',
      items: speakers.map(idx => ({ text: `Speaker ${idx + 1}` })),
    })
  }

  // Discussion: the headline lines paired with the speaker who first said
  // them, so the Mind Map's "Discussion" branch is meaningful.
  if (headlines.length) {
    tree.push({
      label: 'Discussion',
      items: headlines.slice(0, 6).map((h) => {
        const owner = segments.find(seg => (seg.originalText || seg.translatedText || '').includes(h.slice(0, 30)))
        return {
          bold: owner ? `Speaker ${owner.speakerIndex + 1}` : 'Discussion',
          text: h,
        }
      }),
    })
  }

  // Best-effort signals: "Decision" and "next step" cue words. Picks the
  // first segment containing each cue. Optional — empty arrays are fine.
  const cues = {
    Decisions: ['decided', 'agreed', 'concluded', 'karar', 'kararlaştırd'],
    'Next Steps': ['next', 'todo', 'follow up', 'action item', 'will do', 'sonraki', 'yapılacak', 'aksiyon'],
  }
  for (const [label, words] of Object.entries(cues)) {
    const hit = segments.find(seg => {
      const t = (seg.originalText || seg.translatedText || '').toLowerCase()
      return words.some(w => t.includes(w))
    })
    if (hit) {
      tree.push({
        label,
        text: hit.originalText || hit.translatedText,
      })
    }
  }

  return tree
}

// ── 7. Public — compute summary from segments and cache on the session.
//      Returns { headlines, tree }. Throws if there's nothing to summarize.
export const generateSummaryFor = async (sessionId) => {
  if (!sessionId) throw new Error('generateSummaryFor: sessionId required')

  const segments = await fetchSegments(sessionId)
  if (segments.length === 0) {
    throw new Error('No transcript yet. Record some audio before summarising.')
  }

  // Pull both translated and original text into a single stream for scoring;
  // the user's translation language is what they're most likely to read.
  const fullText = segments
    .map(s => s.translatedText || s.originalText)
    .filter(Boolean)
    .join(' ')

  const sentences = splitSentences(fullText)
  if (sentences.length === 0) {
    throw new Error('Transcript was too short to summarise. Try a longer recording.')
  }

  const scored    = scoreSentences(sentences)
  const target    = Math.min(8, Math.max(3, Math.ceil(sentences.length / 6)))
  const headlines = pickTopN(scored, target)
  const tree      = buildTree(segments, headlines)

  const parsed = { headlines, tree }

  // Cache on the session doc so SummaryScreen + Mind Map render instantly
  // on subsequent visits — same shape as the previous Claude flow used.
  await setDoc(
    doc(firestore, 'sessions', sessionId),
    {
      summary: parsed,
      summaryGeneratedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return parsed
}

// Convenience — clear a stale summary so the UI falls back to placeholders.
export const clearSummaryFor = (sessionId) =>
  updateSession(sessionId, { summary: null, summaryGeneratedAt: null })
