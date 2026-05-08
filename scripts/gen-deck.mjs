// Generate the Sheen AI stakeholder pitch deck (.pptx).
//
// Run from the project root: `node scripts/gen-deck.mjs`. Produces
// docs/Sheen-AI-Pitch-Deck.pptx — investor / stakeholder-facing slides
// covering product, technology, unit economics, profit projections,
// distribution, status, roadmap, and risks.
import pptxgen from 'pptxgenjs'

// ── Brand palette ────────────────────────────────────────────────────
const PURPLE_DEEP    = '4A2070'
const PURPLE_MID     = '8163A3'
const PURPLE_LIGHT   = 'BDA2DA'
const LILA_BG        = 'E6DFED'
const LILA_LIGHTER   = 'F2EDF7'
const WHITE          = 'FFFFFF'
const TEXT_DARK      = '2A1A3A'
const TEXT_MUTED     = '666666'
const ACCENT_GOLD    = 'D4A24C'   // for highlight numbers
const SUCCESS_GREEN  = '2E7D52'
const WARN_AMBER     = 'B7791F'
const DANGER_RED     = 'B32B2B'

// ── Slide constants (LAYOUT_WIDE = 13.3" × 7.5") ───────────────────
const W = 13.3
const H = 7.5
const MARGIN = 0.6

// ── Init ─────────────────────────────────────────────────────────────
const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author  = 'Halit Koraya'
pres.title   = 'Sheen AI — Stakeholder Pitch Deck'
pres.subject = 'Cross-platform meeting transcription + AI assistant'

// ── Helpers ──────────────────────────────────────────────────────────
const addPurpleBg = (slide) => {
  slide.background = { color: PURPLE_DEEP }
  // Subtle accent bar on the right edge
  slide.addShape(pres.shapes.RECTANGLE, {
    x: W - 0.18, y: 0, w: 0.18, h: H,
    fill: { color: PURPLE_LIGHT }, line: { type: 'none' },
  })
}

const addLilaBg = (slide) => {
  slide.background = { color: LILA_LIGHTER }
}

const addPageNumber = (slide, n, total) => {
  slide.addText(`${n} / ${total}`, {
    x: W - 1.6, y: H - 0.4, w: 1.2, h: 0.3,
    fontFace: 'Calibri', fontSize: 10, color: TEXT_MUTED, align: 'right',
  })
}

const addBrandFooter = (slide) => {
  slide.addText('Sheen AI', {
    x: 0.4, y: H - 0.4, w: 2, h: 0.3,
    fontFace: 'Calibri', fontSize: 10, color: TEXT_MUTED, bold: true,
  })
}

// Section header with optional kicker
const slideTitle = (slide, title, kicker = null) => {
  if (kicker) {
    slide.addText(kicker, {
      x: MARGIN, y: 0.55, w: W - 2 * MARGIN, h: 0.35,
      fontFace: 'Calibri', fontSize: 13, color: PURPLE_MID, bold: true,
      charSpacing: 4,
    })
  }
  slide.addText(title, {
    x: MARGIN, y: kicker ? 0.95 : 0.6, w: W - 2 * MARGIN, h: 0.85,
    fontFace: 'Calibri', fontSize: 32, bold: true, color: PURPLE_DEEP,
    margin: 0,
  })
}

// Big stat — 60+ pt number with caption underneath
const bigStat = (slide, x, y, w, num, label, color = PURPLE_DEEP) => {
  slide.addText(num, {
    x, y, w, h: 1.0,
    fontFace: 'Calibri', fontSize: 52, bold: true, color, align: 'center', margin: 0,
  })
  slide.addText(label, {
    x, y: y + 1.0, w, h: 0.4,
    fontFace: 'Calibri', fontSize: 13, color: TEXT_MUTED, align: 'center', margin: 0,
  })
}

// Card — rounded rectangle with title, body text. Returns nothing.
const card = (slide, x, y, w, h, title, body, opts = {}) => {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: opts.fill || WHITE },
    line: { color: opts.border || PURPLE_LIGHT, width: 1 },
  })
  // Optional accent bar on the left
  if (opts.accent) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.12, h,
      fill: { color: opts.accent }, line: { type: 'none' },
    })
  }
  // Title
  slide.addText(title, {
    x: x + 0.3, y: y + 0.25, w: w - 0.6, h: 0.45,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: PURPLE_DEEP, margin: 0,
  })
  // Body
  if (body) {
    const bodyArr = Array.isArray(body)
      ? body.map((line, i) => ({ text: line, options: { breakLine: i < body.length - 1 } }))
      : body
    slide.addText(bodyArr, {
      x: x + 0.3, y: y + 0.75, w: w - 0.6, h: h - 0.95,
      fontFace: 'Calibri', fontSize: 12, color: TEXT_DARK, valign: 'top', margin: 0,
      paraSpaceAfter: 4,
    })
  }
}

// Table styling — branded header row, alternating body rows
const brandedTable = (slide, headers, rows, opts = {}) => {
  const tableData = []
  // Header row
  tableData.push(headers.map(h => ({
    text: h,
    options: {
      bold: true, color: WHITE, fill: { color: PURPLE_DEEP },
      fontFace: 'Calibri', fontSize: 13, align: 'left', valign: 'middle',
    },
  })))
  // Body rows
  rows.forEach((row, i) => {
    tableData.push(row.map((c, j) => ({
      text: String(c),
      options: {
        bold: opts.boldFirstCol && j === 0,
        color: TEXT_DARK,
        fill: { color: i % 2 === 0 ? LILA_BG : WHITE },
        fontFace: 'Calibri', fontSize: 12, align: 'left', valign: 'middle',
      },
    })))
  })
  slide.addTable(tableData, {
    x: opts.x || MARGIN,
    y: opts.y || 1.7,
    w: opts.w || W - 2 * MARGIN,
    colW: opts.colW,
    rowH: opts.rowH || 0.45,
    border: { pt: 0.5, color: PURPLE_LIGHT },
  })
}

// ── Slide builders ───────────────────────────────────────────────────
const TOTAL_PLACEHOLDER = 0  // will set after we know total slide count
const slides = []

// Track slides via builders so page numbering can pick up the final count
const buildCover = () => {
  const s = pres.addSlide()
  addPurpleBg(s)

  // Big logomark / S monogram suggestion: an oval with "S"
  s.addShape(pres.shapes.OVAL, {
    x: W / 2 - 0.7, y: 1.4, w: 1.4, h: 1.4,
    fill: { color: PURPLE_LIGHT }, line: { color: WHITE, width: 4 },
    shadow: { type: 'outer', color: '000000', blur: 12, offset: 4, angle: 135, opacity: 0.3 },
  })
  s.addText('S', {
    x: W / 2 - 0.7, y: 1.4, w: 1.4, h: 1.4,
    fontFace: 'Calibri', fontSize: 56, bold: true, color: WHITE, align: 'center', valign: 'middle', margin: 0,
  })

  s.addText('SHEEN AI', {
    x: 1, y: 3.2, w: W - 2, h: 1.2,
    fontFace: 'Calibri', fontSize: 84, bold: true, color: WHITE, align: 'center', margin: 0,
    charSpacing: 8,
  })
  s.addText('AI-powered meeting transcription, translation, and analysis', {
    x: 1, y: 4.4, w: W - 2, h: 0.6,
    fontFace: 'Calibri', fontSize: 22, color: PURPLE_LIGHT, align: 'center', italic: true, margin: 0,
  })
  s.addText('Stakeholder Pitch Deck · Version 1.0 · ' + new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }), {
    x: 1, y: 6.3, w: W - 2, h: 0.4,
    fontFace: 'Calibri', fontSize: 14, color: PURPLE_LIGHT, align: 'center', margin: 0,
  })
  s.addText('Halit Koraya', {
    x: 1, y: 6.7, w: W - 2, h: 0.35,
    fontFace: 'Calibri', fontSize: 13, color: WHITE, align: 'center', margin: 0,
  })
}

const buildSection = (kicker, title) => {
  const s = pres.addSlide()
  addPurpleBg(s)
  s.addText(kicker, {
    x: 1, y: 2.8, w: W - 2, h: 0.5,
    fontFace: 'Calibri', fontSize: 18, color: PURPLE_LIGHT, bold: true,
    align: 'center', margin: 0, charSpacing: 6,
  })
  s.addText(title, {
    x: 1, y: 3.4, w: W - 2, h: 1.4,
    fontFace: 'Calibri', fontSize: 64, bold: true, color: WHITE,
    align: 'center', margin: 0,
  })
}

const buildProblem = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Meetings Lose Substance Faster Than We Capture It', 'THE PROBLEM')
  card(s, MARGIN,        2.0, 4.0, 4.5,
    'Existing tools are expensive',
    [
      '$15-$30 per month entry tier',
      'Charge per recording hour',
      'Translation almost always an add-on',
    ],
    { accent: DANGER_RED })
  card(s, MARGIN + 4.2,  2.0, 4.0, 4.5,
    'Cloud-only audio',
    [
      'Audio uploaded to the vendor\'s cloud',
      'Privacy concerns for legal, medical, journalism',
      'Hidden storage cost passed through to the user',
    ],
    { accent: WARN_AMBER })
  card(s, MARGIN + 8.4,  2.0, 4.0, 4.5,
    'Knowledge evaporates',
    [
      'Notes captured by one participant — at best',
      'Multilingual teams pay a translation tax',
      'AI Q&A locked behind premium tiers',
    ],
    { accent: PURPLE_MID })
  addBrandFooter(s)
}

const buildSolution = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'One Tap Captures the Entire Meeting', 'OUR SOLUTION')

  const flowY = 2.4
  const flowH = 1.0
  const stepW = 1.85
  const gap = 0.25
  const startX = (W - (stepW * 5 + gap * 4)) / 2

  const steps = [
    { t: 'Record',          d: 'Tap, speak, walk away',           c: PURPLE_DEEP },
    { t: 'Live Transcript', d: 'Streaming via Deepgram',           c: PURPLE_MID },
    { t: 'Translate',       d: 'Multilingual on the fly',          c: PURPLE_LIGHT },
    { t: 'Mind Map',        d: 'Topics, decisions, outline',       c: PURPLE_MID },
    { t: 'Ask AI',          d: 'Gemini-powered Q&A',               c: PURPLE_DEEP },
  ]

  steps.forEach((step, i) => {
    const x = startX + i * (stepW + gap)
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: flowY, w: stepW, h: flowH,
      fill: { color: step.c }, line: { type: 'none' },
      shadow: { type: 'outer', color: '000000', blur: 6, offset: 2, angle: 135, opacity: 0.12 },
    })
    s.addText(step.t, {
      x, y: flowY + 0.15, w: stepW, h: 0.4,
      fontFace: 'Calibri', fontSize: 16, bold: true, color: WHITE, align: 'center', margin: 0,
    })
    s.addText(step.d, {
      x, y: flowY + 0.55, w: stepW, h: 0.4,
      fontFace: 'Calibri', fontSize: 11, color: WHITE, align: 'center', margin: 0,
    })
    if (i < steps.length - 1) {
      const arrowX = x + stepW + 0.02
      s.addText('→', {
        x: arrowX, y: flowY + 0.25, w: gap - 0.04, h: 0.5,
        fontFace: 'Calibri', fontSize: 22, bold: true, color: PURPLE_DEEP, align: 'center', margin: 0,
      })
    }
  })

  // Highlight box below the flow
  s.addShape(pres.shapes.RECTANGLE, {
    x: MARGIN, y: 4.4, w: W - 2 * MARGIN, h: 1.7,
    fill: { color: LILA_BG }, line: { color: PURPLE_LIGHT, width: 1 },
  })
  s.addText('AUDIO STAYS ON THE DEVICE', {
    x: MARGIN + 0.4, y: 4.55, w: W - 2 * MARGIN - 0.8, h: 0.4,
    fontFace: 'Calibri', fontSize: 14, bold: true, color: PURPLE_DEEP, charSpacing: 4, margin: 0,
  })
  s.addText('We persist transcripts, summaries, and AI chat history — never the raw audio bytes. Deepgram processes the stream transiently, and the WAV file lives in the device\'s IndexedDB. Eliminates the largest cloud cost competitors carry, and addresses the privacy concerns that block enterprise adoption.', {
    x: MARGIN + 0.4, y: 4.95, w: W - 2 * MARGIN - 0.8, h: 1.1,
    fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK, margin: 0, paraSpaceAfter: 4,
  })
  addBrandFooter(s)
}

const buildDifferentiators = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Three Structural Advantages', 'WHY US')

  const colW = 4.0
  const colH = 4.5
  const startX = (W - (colW * 3 + 0.4 * 2)) / 2
  const y = 2.2

  // Number badges
  const cols = [
    { num: '01', t: 'On-Device Audio',
      d: 'IndexedDB stores the encoded WAV on the user\'s phone. Nothing uploads to cloud Storage. Eliminates per-user storage cost and lifts the biggest privacy objection.' },
    { num: '02', t: 'Live Multilingual Translation',
      d: 'Deepgram Nova-3 + Google Translate ships from day one. Turkish, English, Russian, Arabic, German, Spanish, more. Other tools sell translation as a separate add-on.' },
    { num: '03', t: '~12× Cheaper AI Stack',
      d: 'Gemini 2.5 Flash + Pro routing replaced the Anthropic stack our peers run. Same answer quality at a fraction of the cost — savings flow into margin or into more generous quotas.' },
  ]

  cols.forEach((c, i) => {
    const x = startX + i * (colW + 0.4)
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: colH,
      fill: { color: WHITE }, line: { color: PURPLE_LIGHT, width: 1 },
      shadow: { type: 'outer', color: '000000', blur: 8, offset: 2, angle: 135, opacity: 0.1 },
    })
    // Number badge
    s.addShape(pres.shapes.OVAL, {
      x: x + 0.4, y: y + 0.4, w: 0.9, h: 0.9,
      fill: { color: PURPLE_DEEP }, line: { type: 'none' },
    })
    s.addText(c.num, {
      x: x + 0.4, y: y + 0.4, w: 0.9, h: 0.9,
      fontFace: 'Calibri', fontSize: 22, bold: true, color: WHITE,
      align: 'center', valign: 'middle', margin: 0,
    })
    // Title
    s.addText(c.t, {
      x: x + 0.4, y: y + 1.5, w: colW - 0.8, h: 0.6,
      fontFace: 'Calibri', fontSize: 18, bold: true, color: PURPLE_DEEP, margin: 0,
    })
    // Body
    s.addText(c.d, {
      x: x + 0.4, y: y + 2.2, w: colW - 0.8, h: 2.1,
      fontFace: 'Calibri', fontSize: 13, color: TEXT_DARK, margin: 0, paraSpaceAfter: 4,
    })
  })
  addBrandFooter(s)
}

const buildAudience = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'Who We Build For', 'TARGET AUDIENCE')

  const audience = [
    { t: 'Independent professionals', d: 'Lawyers, consultants, therapists running back-to-back client calls. Privacy posture matters.' },
    { t: 'University students',        d: 'Recording lectures and seminars; English-language content for non-English speakers.' },
    { t: 'Multilingual remote teams',  d: 'TR/EN/RU/AR/DE/ES meetings. Built-in translation removes a separate vendor.' },
    { t: 'Journalists & researchers',  d: 'Interview transcripts, AI Q&A on long-form recordings, source-grounded answers.' },
    { t: 'Small businesses (3-20)',    d: 'Stand-ups and kickoffs. Affordable subscription tier replaces ad-hoc note-taking.' },
  ]

  // 5 cards in a 2-3 grid: top row 3, bottom row 2 (centered)
  const cardW = 3.9
  const cardH = 2.4
  const gap = 0.3
  const topY = 2.0
  const bottomY = topY + cardH + gap
  const topStartX = (W - (cardW * 3 + gap * 2)) / 2
  const bottomStartX = (W - (cardW * 2 + gap)) / 2

  audience.slice(0, 3).forEach((a, i) => {
    const x = topStartX + i * (cardW + gap)
    card(s, x, topY, cardW, cardH, a.t, a.d, { accent: PURPLE_DEEP })
  })
  audience.slice(3).forEach((a, i) => {
    const x = bottomStartX + i * (cardW + gap)
    card(s, x, bottomY, cardW, cardH, a.t, a.d, { accent: PURPLE_MID })
  })
  addBrandFooter(s)
}

const buildArchitecture = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'Seven Layers, One Codebase', 'TECHNICAL ARCHITECTURE')

  const layers = [
    { t: 'Presentation',     d: 'React 18 + Vite, wrapped natively by Capacitor 8 (iOS + Android shells)' },
    { t: 'Application',      d: 'React Context state machines for auth, recording lifecycle, AI chat' },
    { t: 'Backend',          d: 'Firebase Auth + Firestore + Cloud Functions v2 + Cloud Storage rules' },
    { t: 'AI',               d: 'Google Gemini 2.5 Flash (default) + Pro (auto-routed for hard questions)' },
    { t: 'Speech-to-Text',   d: 'Deepgram Nova-3 streaming, plus Google Translate for cross-language segments' },
    { t: 'Streaming Server', d: 'TypeScript Cloud Run service bridging the device to Deepgram via WebSocket' },
    { t: 'Storage',          d: 'Firestore for transcripts + metadata · IndexedDB on the device for audio' },
  ]
  const rowH = 0.55
  const startY = 1.95
  layers.forEach((l, i) => {
    const y = startY + i * (rowH + 0.06)
    // Layer index pill
    s.addShape(pres.shapes.RECTANGLE, {
      x: MARGIN, y, w: 0.55, h: rowH,
      fill: { color: PURPLE_DEEP }, line: { type: 'none' },
    })
    s.addText(String(i + 1).padStart(2, '0'), {
      x: MARGIN, y, w: 0.55, h: rowH,
      fontFace: 'Calibri', fontSize: 14, bold: true, color: WHITE,
      align: 'center', valign: 'middle', margin: 0,
    })
    // Layer name
    s.addText(l.t, {
      x: MARGIN + 0.7, y, w: 2.6, h: rowH,
      fontFace: 'Calibri', fontSize: 14, bold: true, color: PURPLE_DEEP,
      valign: 'middle', margin: 0,
    })
    // Description
    s.addText(l.d, {
      x: MARGIN + 3.4, y, w: W - 2 * MARGIN - 3.4, h: rowH,
      fontFace: 'Calibri', fontSize: 12, color: TEXT_DARK,
      valign: 'middle', margin: 0,
    })
  })
  addBrandFooter(s)
}

const buildTechStack = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Tech Stack at a Glance', 'TECHNOLOGY')

  const groups = [
    { hdr: 'FRONTEND',  items: ['React 18', 'Vite 5', 'Capacitor 8', 'Web Audio API', 'IndexedDB'] },
    { hdr: 'BACKEND',   items: ['Firebase Auth', 'Firestore', 'Cloud Functions v2', 'Cloud Run', 'Secret Manager'] },
    { hdr: 'AI / ML',   items: ['Gemini 2.5 Flash', 'Gemini 2.5 Pro', 'Deepgram Nova-3', 'Google Translate', 'Custom router'] },
  ]
  const colW = 4.0
  const colH = 4.4
  const startX = (W - (colW * 3 + 0.3 * 2)) / 2
  const y = 1.8

  groups.forEach((g, i) => {
    const x = startX + i * (colW + 0.3)
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: colH,
      fill: { color: WHITE }, line: { color: PURPLE_LIGHT, width: 1 },
    })
    // Header band
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: 0.7,
      fill: { color: PURPLE_DEEP }, line: { type: 'none' },
    })
    s.addText(g.hdr, {
      x, y, w: colW, h: 0.7,
      fontFace: 'Calibri', fontSize: 17, bold: true, color: WHITE,
      align: 'center', valign: 'middle', margin: 0, charSpacing: 5,
    })
    // List items
    g.items.forEach((item, j) => {
      const itemY = y + 1.0 + j * 0.6
      // Bullet dot
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.5, y: itemY + 0.18, w: 0.2, h: 0.2,
        fill: { color: PURPLE_MID }, line: { type: 'none' },
      })
      s.addText(item, {
        x: x + 0.85, y: itemY, w: colW - 1.05, h: 0.55,
        fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK,
        valign: 'middle', margin: 0,
      })
    })
  })
  addBrandFooter(s)
}

const buildDataFlow = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'How a Recording Becomes a Searchable Transcript', 'DATA FLOW')

  // Recording flow
  s.addText('Recording', {
    x: MARGIN, y: 1.85, w: 2.5, h: 0.4,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: PURPLE_DEEP,
    margin: 0, charSpacing: 4,
  })

  const recSteps = [
    'Mic captures Float32 PCM',
    'Downsample to 16 kHz',
    'WebSocket → Cloud Run',
    'Deepgram returns JSON',
    'Final fragments → Firestore',
  ]
  const stepW = 2.32
  const stepH = 0.7
  const startX = MARGIN
  const recY = 2.35

  recSteps.forEach((step, i) => {
    const x = startX + i * (stepW + 0.1)
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: recY, w: stepW, h: stepH,
      fill: { color: LILA_BG }, line: { color: PURPLE_LIGHT, width: 1 },
    })
    s.addText(`${i + 1}. ${step}`, {
      x: x + 0.15, y: recY, w: stepW - 0.3, h: stepH,
      fontFace: 'Calibri', fontSize: 11, color: TEXT_DARK,
      valign: 'middle', margin: 0,
    })
  })

  // AI chat flow
  s.addText('AI Chat', {
    x: MARGIN, y: 3.6, w: 2.5, h: 0.4,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: PURPLE_DEEP,
    margin: 0, charSpacing: 4,
  })

  const chatSteps = [
    'User asks question',
    'aiChat Cloud Function',
    'Load transcript context',
    'Router → Flash or Pro',
    'Gemini answer + cite [MM:SS]',
  ]
  const chatY = 4.1
  chatSteps.forEach((step, i) => {
    const x = startX + i * (stepW + 0.1)
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: chatY, w: stepW, h: stepH,
      fill: { color: PURPLE_DEEP }, line: { type: 'none' },
    })
    s.addText(`${i + 1}. ${step}`, {
      x: x + 0.15, y: chatY, w: stepW - 0.3, h: stepH,
      fontFace: 'Calibri', fontSize: 11, color: WHITE,
      valign: 'middle', margin: 0,
    })
  })

  // Footnote
  s.addShape(pres.shapes.RECTANGLE, {
    x: MARGIN, y: 5.5, w: W - 2 * MARGIN, h: 1.3,
    fill: { color: LILA_LIGHTER }, line: { color: PURPLE_LIGHT, width: 1 },
  })
  s.addText('Audio buffer is encoded to WAV at stop and saved to IndexedDB on the device — never uploaded.\nFirestore Security Rules restrict every collection to the authenticated owner. The tier field is server-only.', {
    x: MARGIN + 0.3, y: 5.6, w: W - 2 * MARGIN - 0.6, h: 1.1,
    fontFace: 'Calibri', fontSize: 13, color: TEXT_DARK, italic: true, margin: 0, paraSpaceAfter: 4,
  })
  addBrandFooter(s)
}

const buildTierMatrix = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Four Tiers, Clear Upgrade Path', 'PRICING')
  brandedTable(s,
    ['Tier', 'Monthly', 'Recording', 'AI Quota', 'Models'],
    [
      ['Free',         '$0',          '1 hour',     'Locked (visible CTA)',     '—'],
      ['Advance',      '$9.99',       '6 hours',    '50 queries',               'Gemini Flash'],
      ['Premium',      '$19.99',      '20 hours',   '200 queries',              'Flash + Pro auto-route'],
      ['Professional', '$49.99',      '80 hours',   '800 queries',              'Flash + Pro priority'],
    ],
    { boldFirstCol: true, colW: [1.7, 1.6, 2.2, 2.6, 4.0], rowH: 0.6, y: 2.0 },
  )

  // Pricing rationale strip
  s.addShape(pres.shapes.RECTANGLE, {
    x: MARGIN, y: 5.7, w: W - 2 * MARGIN, h: 1.2,
    fill: { color: PURPLE_DEEP }, line: { type: 'none' },
  })
  s.addText('Otter $16.99 / Notta $14.99 / Fireflies $10 — we undercut at every tier while shipping live translation built-in.', {
    x: MARGIN + 0.4, y: 5.7, w: W - 2 * MARGIN - 0.8, h: 1.2,
    fontFace: 'Calibri', fontSize: 14, color: WHITE, italic: true,
    align: 'center', valign: 'middle', margin: 0,
  })
  addBrandFooter(s)
}

const buildTopups = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Top-Up Packs — Tier-Priced Relief Valve', 'PRICING')
  brandedTable(s,
    ['Pack',     'Free',     'Advance',   'Premium',  'Professional'],
    [
      ['+2 hours',  '$7.99',   '$4.99',     '$3.99',    '$2.99'],
      ['+5 hours',  '$14.99',  '$9.99',     '$7.99',    '$4.99'],
      ['+15 hours', '$34.99',  '$22.99',    '$17.99',   '$11.99'],
    ],
    { boldFirstCol: true, colW: [2.4, 2.45, 2.45, 2.45, 2.45], rowH: 0.55, y: 2.0 },
  )
  s.addText('The bigger the pack, the cheaper the per-hour rate — but subscription always wins for repeat users (next slide).', {
    x: MARGIN, y: 4.6, w: W - 2 * MARGIN, h: 0.5,
    fontFace: 'Calibri', fontSize: 13, color: TEXT_DARK, italic: true, align: 'center', margin: 0,
  })
  addBrandFooter(s)
}

const buildSubsWins = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Subscription Always Wins on $/hr', 'PRICING')
  brandedTable(s,
    ['Tier', 'Subscription $/hr', 'Cheapest Top-Up $/hr (15 hr)', 'Verdict'],
    [
      ['Advance',      '$1.66',  '$1.53',  'Top-up edge case for one-off bursts only'],
      ['Premium',      '$1.00',  '$1.20',  'Subscription 17% cheaper'],
      ['Professional', '$0.62',  '$0.80',  'Subscription 22% cheaper'],
    ],
    { boldFirstCol: true, colW: [2.5, 3.0, 3.5, 3.1], rowH: 0.6, y: 2.0 },
  )
  s.addShape(pres.shapes.RECTANGLE, {
    x: MARGIN, y: 4.5, w: W - 2 * MARGIN, h: 1.5,
    fill: { color: PURPLE_DEEP }, line: { type: 'none' },
  })
  s.addText('Top-ups exist as a relief valve for occasional overages — never as a strictly cheaper alternative to subscribing. The pricing ladder enforces this without any explicit upsell prompt.', {
    x: MARGIN + 0.4, y: 4.5, w: W - 2 * MARGIN - 0.8, h: 1.5,
    fontFace: 'Calibri', fontSize: 15, color: WHITE, italic: true,
    align: 'center', valign: 'middle', margin: 0,
  })
  addBrandFooter(s)
}

const buildPerUserCost = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Per-User Variable Cost — Average Usage', 'UNIT ECONOMICS')

  // Use a column chart for visual impact
  const chartData = [
    {
      name: 'Monthly cost ($)',
      labels: ['Free', 'Advance', 'Premium', 'Professional'],
      values: [0.21, 1.27, 3.62, 13.40],
    },
    {
      name: 'Monthly price ($)',
      labels: ['Free', 'Advance', 'Premium', 'Professional'],
      values: [0, 9.99, 19.99, 49.99],
    },
  ]
  s.addChart(pres.charts.BAR, chartData, {
    x: MARGIN, y: 1.9, w: 8.0, h: 4.6, barDir: 'col',
    chartColors: [PURPLE_MID, PURPLE_DEEP],
    chartArea: { fill: { color: WHITE }, roundedCorners: false },
    catAxisLabelColor: TEXT_DARK, valAxisLabelColor: TEXT_DARK,
    catAxisLabelFontFace: 'Calibri', catAxisLabelFontSize: 12,
    valAxisLabelFontFace: 'Calibri', valAxisLabelFontSize: 11,
    valGridLine: { color: 'E2E2E8', size: 0.5 },
    catGridLine: { style: 'none' },
    showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFontFace: 'Calibri', dataLabelFontSize: 11, dataLabelColor: TEXT_DARK,
    showLegend: true, legendPos: 'b',
    legendFontFace: 'Calibri', legendFontSize: 11,
  })

  // Margin callout
  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.8, y: 1.9, w: 3.9, h: 4.6,
    fill: { color: WHITE }, line: { color: PURPLE_LIGHT, width: 1 },
  })
  s.addText('AVERAGE GROSS MARGIN', {
    x: 8.95, y: 2.05, w: 3.6, h: 0.4,
    fontFace: 'Calibri', fontSize: 13, bold: true, color: PURPLE_MID,
    align: 'center', charSpacing: 4, margin: 0,
  })
  s.addText('71%', {
    x: 8.95, y: 2.5, w: 3.6, h: 1.6,
    fontFace: 'Calibri', fontSize: 96, bold: true, color: PURPLE_DEEP,
    align: 'center', valign: 'middle', margin: 0,
  })
  s.addText('across paid tiers', {
    x: 8.95, y: 4.2, w: 3.6, h: 0.5,
    fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK,
    align: 'center', italic: true, margin: 0,
  })
  s.addText('Power users at hard cap still profitable\n(Advance 71% · Premium 50% · Pro 19%)', {
    x: 8.95, y: 4.85, w: 3.6, h: 1.5,
    fontFace: 'Calibri', fontSize: 12, color: TEXT_MUTED,
    align: 'center', margin: 0, paraSpaceAfter: 4,
  })
  addBrandFooter(s)
}

const buildWorstCase = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Worst Case Still Profitable', 'UNIT ECONOMICS')
  brandedTable(s,
    ['Tier', 'Cap recording', 'Cap AI', 'Total cost', 'Price', 'Margin'],
    [
      ['Advance',      '6 hours',   '50 queries',                 '$2.91',  '$9.99',  '71%'],
      ['Premium',      '20 hours',  '160 Flash + 40 Pro',         '$9.95',  '$19.99', '50%'],
      ['Professional', '80 hours',  '640 Flash + 160 Pro',        '$40.56', '$49.99', '19%'],
    ],
    { boldFirstCol: true, colW: [2.0, 2.0, 2.8, 1.8, 1.6, 1.9], rowH: 0.6, y: 2.0 },
  )
  s.addText('Even at 100% cap utilisation every paid tier remains profitable. The thin Professional margin only matters for the ~3% of the user base that hits cap — average usage on that tier is ~40 hours, leaving 73% margin.', {
    x: MARGIN, y: 4.5, w: W - 2 * MARGIN, h: 1.2,
    fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK,
    italic: true, margin: 0, paraSpaceAfter: 4,
  })
  addBrandFooter(s)
}

const buildCashFlow = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, '10,000 Users — Monthly P&L', 'PROFIT')
  brandedTable(s,
    ['Line item',                              'Subtotal', 'Running total'],
    [
      ['Subscription · Advance (540 users)',    '$5,395',    '$5,395'],
      ['Subscription · Premium (270 users)',    '$5,397',    '$10,792'],
      ['Subscription · Professional (90)',      '$4,499',    '$15,291'],
      ['Top-ups · paid users',                  '$675',      '$15,966'],
      ['Top-ups · free users',                  '$503',      '$16,469'],
      ['REVENUE',                               '',          '$16,469'],
      ['Variable cost · all tiers',             '($4,532)',  '$11,937'],
      ['Top-up COGS',                           '($176)',    '$11,761'],
      ['GROSS PROFIT',                          '',          '$11,761'],
      ['Fixed (servers, monitoring)',           '($2,500)',  '$9,261'],
      ['NET PROFIT',                            '',          '$9,261'],
    ],
    { boldFirstCol: false, colW: [6.5, 2.55, 2.55], rowH: 0.4, y: 1.9 },
  )
  addBrandFooter(s)
}

const buildScalingTable = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'How the Curve Scales', 'PROFIT')
  brandedTable(s,
    ['Total users', 'MAU',     'Variable profit',  'Fixed cost',  'Net / month',  'Net / year'],
    [
      ['1,000',        '300',     '$1,176',           '$1,500',      '($324)',       '($3,888)'],
      ['10,000',       '3,000',   '$11,761',          '$2,500',      '$9,261',       '$111,000'],
      ['50,000',       '15,000',  '$58,805',          '$4,000',      '$54,805',      '$657,660'],
      ['100,000',      '30,000',  '$117,610',         '$6,500',      '$111,110',     '$1,333,320'],
      ['250,000',      '75,000',  '$294,025',         '$12,000',     '$282,025',     '$3,384,300'],
    ],
    { boldFirstCol: true, colW: [2.0, 1.5, 2.4, 1.8, 2.0, 2.4], rowH: 0.55, y: 2.0 },
  )
  s.addText('Sublinear fixed-cost growth · Vendor pricing scales per-unit, no step-cost cliffs', {
    x: MARGIN, y: 5.6, w: W - 2 * MARGIN, h: 0.4,
    fontFace: 'Calibri', fontSize: 13, color: PURPLE_MID,
    align: 'center', italic: true, margin: 0, charSpacing: 2,
  })
  addBrandFooter(s)
}

const buildAnnualNet = () => {
  const s = pres.addSlide()
  addPurpleBg(s)
  s.addText('ANNUAL NET PROFIT', {
    x: MARGIN, y: 0.9, w: W - 2 * MARGIN, h: 0.5,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: PURPLE_LIGHT,
    align: 'center', charSpacing: 6, margin: 0,
  })
  s.addText('Where the model takes us', {
    x: MARGIN, y: 1.4, w: W - 2 * MARGIN, h: 0.6,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: WHITE,
    align: 'center', margin: 0,
  })

  const stats = [
    { num: '($3.9K)', label: '1K users (loss)',    color: 'E0BFC9' },
    { num: '$111K',   label: '10K users',          color: WHITE },
    { num: '$657K',   label: '50K users',          color: WHITE },
    { num: '$1.33M',  label: '100K users',         color: ACCENT_GOLD },
    { num: '$3.38M',  label: '250K users',         color: ACCENT_GOLD },
  ]
  const itemW = 2.2
  const startX = (W - (itemW * 5 + 0.2 * 4)) / 2
  const y = 3.5
  stats.forEach((stat, i) => {
    const x = startX + i * (itemW + 0.2)
    s.addText(stat.num, {
      x, y, w: itemW, h: 1.4,
      fontFace: 'Calibri', fontSize: 44, bold: true, color: stat.color,
      align: 'center', valign: 'middle', margin: 0,
    })
    s.addText(stat.label, {
      x, y: y + 1.4, w: itemW, h: 0.5,
      fontFace: 'Calibri', fontSize: 13, color: PURPLE_LIGHT,
      align: 'center', margin: 0,
    })
  })
}

const buildBreakEven = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'Break-Even at ~3,500 Users', 'PROFIT')

  // Big stat
  bigStat(s, 1.5, 2.4, 4.5, '~3,500', 'Total registered users', PURPLE_DEEP)
  bigStat(s, 7.3, 2.4, 4.5, '~1,050', 'Monthly active users (MAU)', PURPLE_DEEP)

  // Below — explanation
  s.addShape(pres.shapes.RECTANGLE, {
    x: MARGIN, y: 5.0, w: W - 2 * MARGIN, h: 1.6,
    fill: { color: LILA_BG }, line: { color: PURPLE_LIGHT, width: 1 },
  })
  s.addText('Below this line, fixed costs (~$1.5K-$2.5K/mo for cloud + monitoring) outweigh per-user margin. Above it, the curve scales close-to-linearly because Gemini and Deepgram price per unit. The realistic conversion-rate floor is 3% paid; the model assumes ~9% (30% MAU × 30% paid-of-MAU) — every percentage point of conversion uplift is high-leverage growth.', {
    x: MARGIN + 0.4, y: 5.05, w: W - 2 * MARGIN - 0.8, h: 1.5,
    fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK,
    valign: 'middle', margin: 0, paraSpaceAfter: 4,
  })
  addBrandFooter(s)
}

const buildDistribution = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'Three Channels, One Codebase', 'DISTRIBUTION')

  const channels = [
    { plat: 'iOS',     store: 'App Store via TestFlight', status: 'Pending Mac access', cost: '$99 / yr',   color: PURPLE_DEEP },
    { plat: 'Android', store: 'Google Play Console',      status: 'AAB build ready',     cost: '$25 once',   color: PURPLE_MID },
    { plat: 'Web',     store: 'Standalone HTML / Hosting', status: 'Single-file ready',   cost: 'Negligible', color: PURPLE_LIGHT },
  ]
  const cardW = 4.0
  const cardH = 4.4
  const startX = (W - (cardW * 3 + 0.4 * 2)) / 2
  const y = 1.9
  channels.forEach((c, i) => {
    const x = startX + i * (cardW + 0.4)
    // Top color band
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cardW, h: 0.9,
      fill: { color: c.color }, line: { type: 'none' },
    })
    s.addText(c.plat, {
      x, y, w: cardW, h: 0.9,
      fontFace: 'Calibri', fontSize: 28, bold: true, color: WHITE,
      align: 'center', valign: 'middle', margin: 0,
    })
    // Body
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: y + 0.9, w: cardW, h: cardH - 0.9,
      fill: { color: WHITE }, line: { color: PURPLE_LIGHT, width: 1 },
    })
    s.addText('Distribution', {
      x: x + 0.3, y: y + 1.1, w: cardW - 0.6, h: 0.3,
      fontFace: 'Calibri', fontSize: 11, color: PURPLE_MID, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(c.store, {
      x: x + 0.3, y: y + 1.4, w: cardW - 0.6, h: 0.4,
      fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK, margin: 0,
    })
    s.addText('Status', {
      x: x + 0.3, y: y + 2.0, w: cardW - 0.6, h: 0.3,
      fontFace: 'Calibri', fontSize: 11, color: PURPLE_MID, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(c.status, {
      x: x + 0.3, y: y + 2.3, w: cardW - 0.6, h: 0.4,
      fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK, margin: 0,
    })
    s.addText('Cost', {
      x: x + 0.3, y: y + 2.9, w: cardW - 0.6, h: 0.3,
      fontFace: 'Calibri', fontSize: 11, color: PURPLE_MID, bold: true, charSpacing: 3, margin: 0,
    })
    s.addText(c.cost, {
      x: x + 0.3, y: y + 3.2, w: cardW - 0.6, h: 0.4,
      fontFace: 'Calibri', fontSize: 14, color: TEXT_DARK, margin: 0,
    })
  })
  addBrandFooter(s)
}

const buildStatus = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Where We Are Today', 'STATUS')

  const cols = [
    { hdr: 'COMPLETED', color: SUCCESS_GREEN, items: [
      'Web frontend (all screens)',
      'Firestore rules + indexes',
      'Cloud Functions deployed',
      'Cloud Run streaming server',
      'On-device IndexedDB audio',
      'Capacitor Android platform',
      '4-tier subscription system',
      'Test accounts seeded',
    ]},
    { hdr: 'IN PROGRESS', color: WARN_AMBER, items: [
      'Android Play Console build',
      'Beta tester recruitment',
      'Privacy Policy + Terms drafting',
      'Bundle ID registration',
    ]},
    { hdr: 'NOT STARTED', color: PURPLE_MID, items: [
      'iOS scaffolding (Mac needed)',
      'TestFlight first upload',
      'Stripe / RevenueCat',
      'Native Google + Apple sign-in',
      'Server-side recording quota',
      'Marketing landing page',
    ]},
  ]
  const colW = 4.0
  const colH = 4.7
  const startX = (W - (colW * 3 + 0.3 * 2)) / 2
  const y = 1.85

  cols.forEach((col, i) => {
    const x = startX + i * (colW + 0.3)
    // Header
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: 0.6,
      fill: { color: col.color }, line: { type: 'none' },
    })
    s.addText(col.hdr, {
      x, y, w: colW, h: 0.6,
      fontFace: 'Calibri', fontSize: 14, bold: true, color: WHITE,
      align: 'center', valign: 'middle', margin: 0, charSpacing: 5,
    })
    // Body
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: y + 0.6, w: colW, h: colH - 0.6,
      fill: { color: WHITE }, line: { color: PURPLE_LIGHT, width: 1 },
    })
    col.items.forEach((it, j) => {
      const itemY = y + 0.85 + j * 0.5
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.4, y: itemY + 0.1, w: 0.18, h: 0.18,
        fill: { color: col.color }, line: { type: 'none' },
      })
      s.addText(it, {
        x: x + 0.7, y: itemY, w: colW - 0.9, h: 0.4,
        fontFace: 'Calibri', fontSize: 12, color: TEXT_DARK,
        valign: 'middle', margin: 0,
      })
    })
  })
  addBrandFooter(s)
}

const buildRoadmap = () => {
  const s = pres.addSlide()
  addLilaBg(s)
  slideTitle(s, 'Roadmap', 'WHAT COMES NEXT')

  const cols = [
    { hdr: 'NEAR · 0-4 weeks', items: [
      'Mac → iOS scaffolding + TestFlight',
      'Apple Developer enrolment',
      'Play Console enrolment',
      'Privacy Policy + Terms finalised',
      'Beta cohort (~20 testers)',
      'Landing page',
    ]},
    { hdr: 'MEDIUM · 1-3 months', items: [
      'RevenueCat integration',
      'First paid customer',
      'Native sign-in (Google + Apple)',
      'Server-side recording quota',
      'AI quota monthly reset job',
      'Public App Store + Play launch',
    ]},
    { hdr: 'LONG · 3-9 months', items: [
      'Team / workspace tier',
      'Calendar integrations',
      'Live closed captions',
      'Voice-cloned summaries',
      'Speaker diarisation tuning',
      'Notion / Slack export',
    ]},
  ]
  const colW = 4.0
  const colH = 5.0
  const startX = (W - (colW * 3 + 0.3 * 2)) / 2
  const y = 1.85

  cols.forEach((col, i) => {
    const x = startX + i * (colW + 0.3)
    // Header
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: 0.7,
      fill: { color: PURPLE_DEEP }, line: { type: 'none' },
    })
    s.addText(col.hdr, {
      x: x + 0.2, y, w: colW - 0.4, h: 0.7,
      fontFace: 'Calibri', fontSize: 14, bold: true, color: WHITE,
      valign: 'middle', margin: 0, charSpacing: 4,
    })
    // Body
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: y + 0.7, w: colW, h: colH - 0.7,
      fill: { color: WHITE }, line: { color: PURPLE_LIGHT, width: 1 },
    })
    col.items.forEach((it, j) => {
      const itemY = y + 0.9 + j * 0.55
      s.addText(`${j + 1}.`, {
        x: x + 0.3, y: itemY, w: 0.5, h: 0.4,
        fontFace: 'Calibri', fontSize: 13, bold: true, color: PURPLE_MID, margin: 0,
      })
      s.addText(it, {
        x: x + 0.75, y: itemY, w: colW - 0.95, h: 0.4,
        fontFace: 'Calibri', fontSize: 12, color: TEXT_DARK,
        valign: 'middle', margin: 0,
      })
    })
  })
  addBrandFooter(s)
}

const buildRisks = () => {
  const s = pres.addSlide()
  s.background = { color: WHITE }
  slideTitle(s, 'Top Risks · How We Mitigate', 'RISK')

  const risks = [
    { r: 'Vendor pricing changes',           m: '~70% gross margin baked in. Multi-vendor abstraction on roadmap; aiChat function is already model-agnostic via autoRoute parameter.' },
    { r: 'Conversion below 5%',              m: 'Model still profitable at 5% paid. Below 5% we shift marketing budget into onboarding optimisation (free trial of paid tier, in-app upsell).' },
    { r: 'Power-user cap burn',              m: 'Hard rate limits on Cloud Run + Cloud Functions. Soft fair-use cap kicks in past 90 hrs/mo. Monthly tracking — re-price Pro if heavy share grows.' },
    { r: 'Server-side quota enforcement',    m: 'AI quota already enforced server-side. Recording-minute enforcement scheduled in next sprint via finalizeSession Cloud Function.' },
    { r: 'iOS / Android policy rejections',  m: 'NSMicrophoneUsageDescription documented. Privacy Policy + Terms drafted before submission. RevenueCat handles store IAP requirements.' },
  ]
  const rowH = 0.85
  const startY = 1.9
  risks.forEach((r, i) => {
    const y = startY + i * (rowH + 0.1)
    // Risk badge
    s.addShape(pres.shapes.RECTANGLE, {
      x: MARGIN, y, w: 4.2, h: rowH,
      fill: { color: PURPLE_DEEP }, line: { type: 'none' },
    })
    s.addText(r.r, {
      x: MARGIN + 0.3, y, w: 3.9, h: rowH,
      fontFace: 'Calibri', fontSize: 14, bold: true, color: WHITE,
      valign: 'middle', margin: 0,
    })
    // Mitigation
    s.addShape(pres.shapes.RECTANGLE, {
      x: MARGIN + 4.2, y, w: W - 2 * MARGIN - 4.2, h: rowH,
      fill: { color: LILA_BG }, line: { color: PURPLE_LIGHT, width: 1 },
    })
    s.addText(r.m, {
      x: MARGIN + 4.5, y, w: W - 2 * MARGIN - 4.6, h: rowH,
      fontFace: 'Calibri', fontSize: 12, color: TEXT_DARK,
      valign: 'middle', margin: 0,
    })
  })
  addBrandFooter(s)
}

const buildAsk = () => {
  const s = pres.addSlide()
  addPurpleBg(s)
  s.addText('THE ASK', {
    x: MARGIN, y: 0.7, w: W - 2 * MARGIN, h: 0.5,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: PURPLE_LIGHT,
    align: 'center', charSpacing: 6, margin: 0,
  })
  s.addText('What We Need to Ship', {
    x: MARGIN, y: 1.2, w: W - 2 * MARGIN, h: 0.7,
    fontFace: 'Calibri', fontSize: 36, bold: true, color: WHITE,
    align: 'center', margin: 0,
  })

  const asks = [
    { num: '01', t: 'Apple Developer enrolment', d: '$99 per year. Required for TestFlight + App Store. Approval ~24-48 hours.' },
    { num: '02', t: 'Mac access for iOS build',  d: 'macOS + Xcode. Either purchase / loan a Mac, or use a cloud Mac CI like Codemagic.' },
    { num: '03', t: 'Google Play Console',       d: '$25 one-time. Android distribution channel.' },
    { num: '04', t: 'Beta cohort',               d: '10-20 friendly testers across iOS + Android, ideally multilingual to validate translation flow.' },
    { num: '05', t: 'Marketing seed budget',     d: '$2K-$5K for paid social + content to validate the conversion funnel before scaling spend.' },
  ]
  const colW = 4.5
  const rowH = 1.1
  const cols = 2
  const rowsCount = Math.ceil(asks.length / cols)
  const startY = 2.2
  const startX = (W - (colW * cols + 0.4 * (cols - 1))) / 2

  asks.forEach((a, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = startX + col * (colW + 0.4)
    const y = startY + row * (rowH + 0.2)
    // Number
    s.addShape(pres.shapes.OVAL, {
      x, y: y + 0.15, w: 0.8, h: 0.8,
      fill: { color: ACCENT_GOLD }, line: { type: 'none' },
    })
    s.addText(a.num, {
      x, y: y + 0.15, w: 0.8, h: 0.8,
      fontFace: 'Calibri', fontSize: 18, bold: true, color: WHITE,
      align: 'center', valign: 'middle', margin: 0,
    })
    // Title
    s.addText(a.t, {
      x: x + 1.0, y: y + 0.05, w: colW - 1.0, h: 0.45,
      fontFace: 'Calibri', fontSize: 16, bold: true, color: WHITE, margin: 0,
    })
    // Body
    s.addText(a.d, {
      x: x + 1.0, y: y + 0.5, w: colW - 1.0, h: 0.6,
      fontFace: 'Calibri', fontSize: 11, color: PURPLE_LIGHT, margin: 0,
    })
  })
}

const buildClosing = () => {
  const s = pres.addSlide()
  addPurpleBg(s)
  s.addText('Thank You', {
    x: 1, y: 2.3, w: W - 2, h: 1.4,
    fontFace: 'Calibri', fontSize: 88, bold: true, color: WHITE,
    align: 'center', margin: 0,
  })
  s.addText('Sheen AI — meetings worth their substance.', {
    x: 1, y: 3.7, w: W - 2, h: 0.6,
    fontFace: 'Calibri', fontSize: 22, color: PURPLE_LIGHT,
    align: 'center', italic: true, margin: 0,
  })

  // Contact card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 3.65, y: 5.0, w: 6.0, h: 1.7,
    fill: { color: WHITE, transparency: 90 }, line: { color: PURPLE_LIGHT, width: 1 },
  })
  s.addText([
    { text: 'Halit Koraya', options: { bold: true, fontSize: 18, color: WHITE, breakLine: true } },
    { text: 'github.com/halitkoraya-ai/sheen-ai', options: { fontSize: 14, color: PURPLE_LIGHT, breakLine: true } },
    { text: 'halitkoraya@gmail.com', options: { fontSize: 14, color: PURPLE_LIGHT } },
  ], {
    x: 3.85, y: 5.15, w: 5.6, h: 1.45,
    fontFace: 'Calibri', align: 'center', valign: 'middle', margin: 0, paraSpaceAfter: 4,
  })
}

// ── Build the deck ───────────────────────────────────────────────────
buildCover()
buildProblem()
buildSolution()
buildDifferentiators()
buildAudience()
buildSection('SECTION 01', 'Technology')
buildArchitecture()
buildTechStack()
buildDataFlow()
buildSection('SECTION 02', 'Pricing & Unit Economics')
buildTierMatrix()
buildTopups()
buildSubsWins()
buildPerUserCost()
buildWorstCase()
buildSection('SECTION 03', 'Revenue & Profit')
buildCashFlow()
buildScalingTable()
buildAnnualNet()
buildBreakEven()
buildSection('SECTION 04', 'Distribution & Status')
buildDistribution()
buildStatus()
buildRoadmap()
buildRisks()
buildAsk()
buildClosing()

await pres.writeFile({ fileName: 'docs/Sheen-AI-Pitch-Deck.pptx' })
console.log('✓ Wrote docs/Sheen-AI-Pitch-Deck.pptx')
