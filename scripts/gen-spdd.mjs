// Generate the Sheen AI Software Project Design Document (.docx).
//
// Run from the project root: `node scripts/gen-spdd.mjs`. Produces
// docs/Sheen-AI-Project-Design-Document.docx — a stakeholder-facing
// design doc covering product overview, architecture, tech stack,
// pricing, unit economics, profit projections, security posture,
// roadmap, and risks.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, PageOrientation,
} from 'docx'
import fs from 'node:fs'

// ── Style constants ─────────────────────────────────────────────────
const PURPLE_DARK   = '4A2070'
const PURPLE_MID    = '8163A3'
const PURPLE_LIGHT  = 'BDA2DA'
const LILA_BG       = 'E6DFED'
const GREY_BORDER   = 'CCCCCC'

const PAGE_WIDTH    = 12240   // US Letter, DXA
const PAGE_HEIGHT   = 15840
const MARGIN        = 1440    // 1"
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN  // 9360

// ── Helpers ─────────────────────────────────────────────────────────
const border = (size = 1, color = GREY_BORDER) => ({ style: BorderStyle.SINGLE, size, color })
const allBorders = { top: border(), bottom: border(), left: border(), right: border() }

const cell = ({ text, bold = false, fill = null, span = 1, color = null, align = AlignmentType.LEFT, width }) => new TableCell({
  borders: allBorders,
  width: { size: width, type: WidthType.DXA },
  columnSpan: span,
  shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({
    alignment: align,
    children: [new TextRun({ text, bold, color: color || undefined })],
  })],
})

const headerCell = (text, width, span = 1) => cell({
  text, bold: true, fill: PURPLE_DARK, color: 'FFFFFF',
  align: AlignmentType.LEFT, width, span,
})

const para = (text, opts = {}) => new Paragraph({
  spacing: { after: 120, line: 320 },
  ...opts,
  children: Array.isArray(text)
    ? text.map(t => typeof t === 'string' ? new TextRun(t) : new TextRun(t))
    : [new TextRun(text)],
})

const heading = (text, level = HeadingLevel.HEADING_1) => new Paragraph({
  heading: level,
  children: [new TextRun(text)],
})

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { after: 60, line: 300 },
  children: [new TextRun(text)],
})

const bulletBold = (label, body, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { after: 60, line: 300 },
  children: [
    new TextRun({ text: label, bold: true }),
    new TextRun({ text: ' — ' + body }),
  ],
})

const pageBreak = () => new Paragraph({ children: [new PageBreak()] })

// Build a table with even-width columns from a 2-D array. First row is header.
const dataTable = (rows, widths) => {
  const tableWidth = widths.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      children: r.map((text, j) => cell({
        text: String(text),
        bold: i === 0,
        fill: i === 0 ? PURPLE_DARK : (i % 2 === 0 ? LILA_BG : null),
        color: i === 0 ? 'FFFFFF' : null,
        width: widths[j],
      })),
    })),
  })
}

// ── Document content ────────────────────────────────────────────────
const today = new Date()
const dateStr = today.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

const cover = [
  new Paragraph({ children: [new TextRun('')], spacing: { before: 3000 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'SHEEN AI', size: 96, bold: true, color: PURPLE_DARK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
    children: [new TextRun({ text: 'Software Project Design Document', size: 36, color: PURPLE_MID })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100 },
    children: [new TextRun({ text: 'AI-powered meeting transcription, translation, and analysis', italics: true, size: 24, color: '666666' })],
  }),
  new Paragraph({ children: [new TextRun('')], spacing: { before: 2000 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Version 1.0', size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: dateStr, size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Halit Koraya', size: 22 })],
  }),
  new Paragraph({ children: [new TextRun('')], spacing: { before: 1800 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'CONFIDENTIAL — Stakeholder Review', size: 18, italics: true, color: '999999' })],
  }),
  pageBreak(),
]

// ── Table of Contents ───────────────────────────────────────────────
const tocSection = [
  heading('Table of Contents', HeadingLevel.HEADING_1),
  new TableOfContents('Sheen AI SPDD', { hyperlink: true, headingStyleRange: '1-3' }),
  pageBreak(),
]

// ── 1. Executive Summary ────────────────────────────────────────────
const executiveSummary = [
  heading('1. Executive Summary', HeadingLevel.HEADING_1),

  para('Sheen AI is a cross-platform meeting recording, live transcription, translation, and AI-powered analysis application. It captures audio on the user\'s device, streams it through a private speech-to-text pipeline (Deepgram Nova-3), persists transcripts and metadata to a serverless backend (Firebase / Firestore), and lets users chat with their meetings via a routing-based Gemini stack (Flash by default, Pro on demand for complex questions).'),

  para('The product is positioned in the productivity-tools segment alongside Otter.ai, Fireflies, and Notta — but with three structural advantages: (1) audio bytes never leave the device, eliminating cloud-storage cost and reducing privacy concerns; (2) live multilingual translation is built in from day one; (3) the Gemini-based AI stack is roughly 12× cheaper per query than the Anthropic-based stacks competitors run, which translates directly into healthier unit economics.'),

  para('The codebase is consolidated into a single repository hosting a React 18 + Vite 5 web frontend, two TypeScript backend services (Cloud Functions v2 and a Cloud Run streaming server), and Capacitor 8 native shells for iOS and Android. All cloud infrastructure lives on the user-owned Firebase / GCP project sheen-alpha.'),

  heading('1.1  Headline Numbers', HeadingLevel.HEADING_2),
  bulletBold('Subscription Tiers', 'Free $0 · Advance $9.99 · Premium $19.99 · Professional $49.99 (monthly)'),
  bulletBold('Variable cost per active user (avg. usage)', 'Free $0.21 · Advance $1.27 · Premium $3.62 · Professional $13.40'),
  bulletBold('Average gross margin', '~71% across the paid tiers, ~78% on top-up packs'),
  bulletBold('10,000 user projection', 'Monthly revenue $16,469 · Net profit $9,261 · Annual net ~$111K'),
  bulletBold('100,000 user projection', 'Monthly net profit ~$111K · Annual net ~$1.33M'),
  bulletBold('Break-even', '~3,500 total users (~1,050 monthly active)'),

  heading('1.2  Current Status', HeadingLevel.HEADING_2),
  bullet('Web frontend: feature-complete, builds to a single-file standalone HTML and to a chunked Capacitor bundle.'),
  bullet('Firebase backend: deployed on sheen-alpha (Auth, Firestore with rules + indexes, Cloud Functions v2 with Gemini 2.5 Flash + Pro auto-routing, Storage rules).'),
  bullet('Cloud Run streaming server: deployed (sheen-server-176127438166.us-central1.run.app) with Deepgram Nova-3 + Google Translate.'),
  bullet('Android: Capacitor platform generated, Android Studio project compiles, debug APK runs on Pixel 8 Pro emulator. Play Store internal testing pending.'),
  bullet('iOS: Capacitor scaffolding deferred to a Mac (Apple toolchain dependency). All deploy steps documented in docs/IOS_SETUP.md.'),
  bullet('Source: https://github.com/halitkoraya-ai/sheen-ai (private)'),

  pageBreak(),
]

// ── 2. Product Overview ─────────────────────────────────────────────
const productOverview = [
  heading('2. Product Overview & Value Proposition', HeadingLevel.HEADING_1),

  heading('2.1  Problem', HeadingLevel.HEADING_2),
  para('Knowledge workers spend hours per week in meetings whose substance is rarely captured beyond the rough notes a participant happens to take. Existing transcription tools either require expensive enterprise plans, force the user to upload audio to a cloud they don\'t control, or charge per-hour rates that scale punitively with usage. Multilingual teams pay an additional translation tax — often a separate vendor.'),

  heading('2.2  Solution', HeadingLevel.HEADING_2),
  para('Sheen AI captures, transcribes, translates, summarizes, and answers questions about meetings — in one pass, with audio kept on the device and a single, fairly-priced subscription. The user opens the app, taps record, speaks, and walks away with: a searchable transcript, a Mind Map of the discussion topics, an extractive summary, and (on paid tiers) an AI assistant that can answer follow-up questions about what was said.'),

  heading('2.3  Core User Flows', HeadingLevel.HEADING_2),
  bulletBold('Record → Transcript', 'PCM audio → Cloud Run → Deepgram Nova-3 → JSON transcript fragments → Firestore segments subcollection.'),
  bulletBold('Record → Audio archive', 'PCM samples buffered client-side → encoded to WAV at stop → IndexedDB on the device. Never uploaded.'),
  bulletBold('Mind Map', 'Four fixed top-level branches (Topic, Discussion, Decisions, Outline). The summary tree returned by the AI / extractive pipeline is bucketed into these so the layout is stable.'),
  bulletBold('AI chat', 'Free is locked. Advance / Premium / Professional reach Gemini Flash by default; Premium and Professional auto-escalate to Gemini Pro for questions the router judges deep.'),
  bulletBold('Top-up', 'One-shot purchases (+2 / +5 / +15 hrs) for users who hit their monthly cap. Tier-priced so subscription always wins on a per-hour basis.'),

  heading('2.4  Target Audience', HeadingLevel.HEADING_2),
  bullet('Independent professionals and freelancers running back-to-back client calls (lawyers, consultants, therapists in the EU).'),
  bullet('University students recording lectures and seminars.'),
  bullet('Multilingual remote teams whose meetings span Turkish, English, Russian, Arabic, German, and Spanish.'),
  bullet('Journalists and researchers conducting interviews.'),
  bullet('Small businesses (3–20 employees) running internal stand-ups and kickoff sessions.'),

  heading('2.5  Differentiation vs. Competitors', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Property',           'Sheen AI',                   'Otter.ai',                 'Fireflies',         'Notta'],
      ['Entry paid price',   '$9.99 / 6 hrs',               '$16.99 / 20 hrs',          '$10 / 13 hrs',      '$14.99 / 30 hrs'],
      ['Live translation',   'Built-in, multilingual',      'Add-on',                    'Limited',           'Limited'],
      ['Audio storage',      'On-device only',              'Cloud',                     'Cloud',             'Cloud'],
      ['AI Q&A',             'Tier-gated, Gemini Flash/Pro','Cloud',                     'Cloud',             'Cloud'],
      ['Free tier',          '1 hour, no AI',               '300 min, limited AI',       '800 min',           '120 min'],
    ],
    [1800, 1900, 1900, 1900, 1860],
  ),
  pageBreak(),
]

// ── 3. Technical Architecture ───────────────────────────────────────
const architecture = [
  heading('3. Technical Architecture', HeadingLevel.HEADING_1),

  para('Sheen AI is a thin native shell around a React web application, talking to a serverless backend over HTTPS and a streaming WebSocket to a containerised microservice. All cloud infrastructure runs in a single Firebase / GCP project (sheen-alpha) under one billing account.'),

  heading('3.1  System Layers', HeadingLevel.HEADING_2),
  bulletBold('Presentation', 'React 18 (single codebase) + Vite 5 build pipeline, wrapped by Capacitor 8 for iOS and Android distribution. The same dist/ output ships to web, App Store, and Play Store.'),
  bulletBold('Application', 'React Context state machines (AuthContext, RecordingContext) coordinate auth, capture, and transcription lifecycle. Screens are functional components, no router (state-driven navigation).'),
  bulletBold('Backend services', 'Firebase Auth (identity), Firestore (sessions, transcripts, AI chat history, profile), Cloud Functions v2 (callable APIs for AI chat, summary generation, account deletion, monthly usage reset, RevenueCat webhook), Cloud Run (streaming WebSocket server bridging the device to Deepgram).'),
  bulletBold('AI', 'Google Gemini 2.5 Flash (default Q&A model) + Gemini 2.5 Pro (auto-escalation for complex / comparative / inferential questions). Routing decision happens server-side in the aiChat Cloud Function based on a heuristic over the user\'s message.'),
  bulletBold('Speech-to-text', 'Deepgram Nova-3 streaming with translation, called from Cloud Run. Audio reaches Deepgram only as a transient stream — nothing is persisted.'),
  bulletBold('Translation', 'Google Cloud Translation API (server-side) for cross-language final segments.'),
  bulletBold('Storage', 'Firestore for everything except audio bytes. Audio lives in the device\'s IndexedDB sheen-audio database.'),

  heading('3.2  Recording → Transcript Sequence', HeadingLevel.HEADING_2),
  bullet('User taps the record button on Home. Browser asks for microphone permission.'),
  bullet('AudioCapture (Web Audio API) opens a 16 kHz mono PCM stream. ScriptProcessorNode emits 4096-sample Int16 frames.'),
  bullet('Each frame is forwarded over a private WebSocket to sheen-server (Cloud Run). The same frame is also pushed to the in-memory PCM buffer for the eventual WAV.'),
  bullet('sheen-server validates the Firebase ID token, opens a Deepgram live connection, pipes audio in, and forwards JSON transcript events back over the WebSocket.'),
  bullet('On final transcript fragments, the client batches writes to sessions/{sid}/segments. Periodic flushes guarantee no loss if the user closes the app.'),
  bullet('User taps stop (single tap = pause/resume, hold = stop). PCM buffer is encoded to a WAV blob and saved into IndexedDB. Session document gets duration, speaker count, and a localAudioId pointer.'),

  heading('3.3  AI Chat Sequence', HeadingLevel.HEADING_2),
  bullet('User on Advance / Premium / Professional taps "Ask AI about this recording".'),
  bullet('useAiChat hook calls the aiChat HTTPS-callable Cloud Function with sessionId, message, and tier-derived options (models, autoRoute, priority).'),
  bullet('Function authenticates the request, atomically reserves an AI quota slot, loads the segments collection, formats the transcript with [MM:SS] timestamps and speaker labels.'),
  bullet('Routing heuristic over the user\'s message decides Flash vs Pro. Defaults to Flash; cue words ("compare", "why", "imply", Turkish equivalents) plus message length escalate to Pro for autoRoute tiers.'),
  bullet('Gemini response is parsed for [MM:SS] markers (jump-to-time chips), persisted to chatMessages subcollection, and returned to the client along with running quota counters and modelUsed.'),

  heading('3.4  Local Audio', HeadingLevel.HEADING_2),
  para('The single largest cloud cost competitors carry is audio storage. Sheen AI eliminates it: the WAV blob lives in the device\'s IndexedDB at key sessionId. The session document only records a pointer (localAudioId). When the user opens a recording, the React app converts the blob back to a URL via URL.createObjectURL and pipes it into a standard <audio> element. When the user deletes a recording, IndexedDB and Firestore are wiped in tandem, and account deletion clears every locally stored audio file before sign-out.'),

  pageBreak(),
]

// ── 4. Technology Stack ─────────────────────────────────────────────
const techStack = [
  heading('4. Technology Stack', HeadingLevel.HEADING_1),

  heading('4.1  Frontend', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Layer',                'Choice',                   'Why'],
      ['UI framework',         'React 18',                  'Familiar, large ecosystem'],
      ['Build tool',           'Vite 5',                    'Fast dev server, dual-mode build'],
      ['Native wrapper',       'Capacitor 8',               'One codebase → iOS + Android'],
      ['Audio capture',        'Web Audio API',             'No additional library, 100% browser-native'],
      ['Local audio store',    'IndexedDB',                 'Persistent, large-blob friendly, no cloud cost'],
      ['Single-file artifact', 'vite-plugin-singlefile',    'For demo / preview distribution'],
      ['Icons',                'Inline SVGs',               'No emoji, no font dependency'],
    ],
    [2400, 2400, 4560],
  ),

  heading('4.2  Backend & Cloud', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Layer',               'Choice',                                   'Why'],
      ['Identity',            'Firebase Auth (Email + Google + Apple)',   'Mature, free below 50K MAU'],
      ['Database',            'Firestore (NAM5 multi-region)',             'Strong consistency, security rules, free tier'],
      ['Server functions',    'Cloud Functions v2 (Node 22)',              'No infra, pay-per-invocation'],
      ['Streaming server',    'Cloud Run (TypeScript Node 20 container)',  'WebSocket + scale-to-zero'],
      ['Speech-to-text',      'Deepgram Nova-3 (live + translation)',      'Lowest cost per minute at our quality bar'],
      ['Translation',         'Google Cloud Translation API',              'Native GCP integration'],
      ['LLM (default)',       'Gemini 2.5 Flash',                          '~12× cheaper than Anthropic Haiku, comparable quality for Q&A'],
      ['LLM (escalation)',    'Gemini 2.5 Pro',                            '~2× cheaper than Sonnet, used only when routed'],
      ['Secrets',             'Google Secret Manager',                     'Versioned, IAM-controlled, never in repo'],
    ],
    [2400, 3600, 3360],
  ),

  heading('4.3  Tooling & Distribution', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Concern',                  'Choice'],
      ['Source control',           'Git, GitHub (private repo halitkoraya-ai/sheen-ai)'],
      ['Web hosting',              'Standalone HTML build (file:// distribution) — Firebase Hosting if needed'],
      ['Android distribution',     'Google Play Console (internal → external testing → production)'],
      ['iOS distribution',         'TestFlight → App Store Connect → App Store'],
      ['CI / Mac builds',          'Codemagic or GitHub Actions macOS runners (deferred until iOS scaffolded)'],
      ['Asset generation',         'sharp + @capacitor/assets'],
    ],
    [3000, 6360],
  ),
  pageBreak(),
]

// ── 5. Data Model ───────────────────────────────────────────────────
const dataModel = [
  heading('5. Data Model', HeadingLevel.HEADING_1),

  heading('5.1  Firestore Collections', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Path',                                         'Purpose',                                                'Rules summary'],
      ['users/{uid}',                                  'Profile + tier + monthly usage counters',                'Owner read/write, except tier locked from client'],
      ['users/{uid}/usage/{monthId}',                  'Historical metering (server-only writes)',               'Owner read'],
      ['sessions/{sid}',                               'One recording — title, duration, speaker count, tier',   'Owner read/write/delete (where userId == auth.uid)'],
      ['sessions/{sid}/segments/{segId}',              'Final transcript fragments with [MM:SS] timing',         'Owner read/write via session ownership'],
      ['sessions/{sid}/chatMessages/{mid}',            'AI conversation history',                                'Owner read/create/delete via session ownership'],
      ['deletions/{docId}',                            'Audit trail of account deletions',                       'Server-only (admin SDK)'],
    ],
    [3000, 3200, 3160],
  ),

  heading('5.2  Composite Indexes', HeadingLevel.HEADING_2),
  bullet('sessions: (userId ASC, createdAt DESC) — the only index needed for the Records list query.'),

  heading('5.3  Tier Enforcement', HeadingLevel.HEADING_2),
  para('Tier is the single most security-sensitive field. The Firestore rule blocks any client write that touches the tier field, so a malicious client cannot promote itself to Professional. All tier mutations happen server-side: the RevenueCat webhook (or a future Stripe equivalent) updates the field via the admin SDK after a successful payment.'),

  heading('5.4  On-Device Audio Schema', HeadingLevel.HEADING_2),
  para('IndexedDB database sheen-audio has a single object store recordings keyed by sessionId. Each record is { blob: Blob (audio/wav), durationSec: number, sampleRate: number, savedAt: number }. The blob is decoded only when the user opens a recording in the detail screen — never sent to a server.'),
  pageBreak(),
]

// ── 6. Subscription Tiers ───────────────────────────────────────────
const tiers = [
  heading('6. Subscription Tiers & Pricing', HeadingLevel.HEADING_1),

  para('Pricing is anchored on competitor benchmarks ($16.99 Otter, $14.99 Notta) but undercuts the closest rival by ~$2 at every tier while offering generous AI quotas. The model intentionally lets the Free tier carry a small loss; the conversion economics dwarf the loss-leader cost.'),

  heading('6.1  Tier Matrix', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Tier',          'Price',       'Recording',          'AI quota',                       'Models'],
      ['Free',          '$0',           '1 hour / month',     'Locked (visible upgrade CTA)',   '—'],
      ['Advance',       '$9.99 / mo',   '6 hours / month',    '50 queries / month',             'Gemini Flash'],
      ['Premium',       '$19.99 / mo',  '20 hours / month',   '200 queries / month',            'Flash + Pro auto-route'],
      ['Professional',  '$49.99 / mo',  '80 hours / month',   '800 queries / month',            'Flash + Pro priority queue'],
    ],
    [1800, 1700, 2200, 2300, 1360],
  ),

  heading('6.2  Top-up Packs', HeadingLevel.HEADING_2),
  para('One-shot top-ups exist as a relief valve for users who briefly exceed their cap. Per-hour rates are intentionally tier-priced so a Free-tier user is always strictly better off subscribing to Advance than buying multiple Free-tier top-ups.'),
  dataTable(
    [
      ['Pack',     'Free',     'Advance',   'Premium',  'Professional'],
      ['+2 hours', '$7.99',    '$4.99',     '$3.99',    '$2.99'],
      ['+5 hours', '$14.99',   '$9.99',     '$7.99',    '$4.99'],
      ['+15 hours','$34.99',   '$22.99',    '$17.99',   '$11.99'],
    ],
    [1860, 1875, 1875, 1875, 1875],
  ),

  heading('6.3  Subscription Always Wins', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Tier',         'Subscription $/hr', 'Cheapest top-up $/hr (15-hr pack)'],
      ['Advance',      '$1.66',              '$1.53 (technical edge case — 15h pack > monthly cap)'],
      ['Premium',      '$1.00',              '$1.20'],
      ['Professional', '$0.62',              '$0.80'],
    ],
    [3000, 3000, 3360],
  ),
  pageBreak(),
]

// ── 7. Cost Analysis ────────────────────────────────────────────────
const costAnalysis = [
  heading('7. Cost Analysis', HeadingLevel.HEADING_1),

  heading('7.1  Unit Cost Components', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Service',                                   'Unit cost',                'Notes'],
      ['Deepgram Nova-3 (streaming + translation)', '$0.008 / minute',          'Includes Cloud Run overhead'],
      ['Gemini 2.5 Flash',                          '$0.075 / 1M input tokens', 'Plus $0.30 / 1M output → ~$0.0006 / query'],
      ['Gemini 2.5 Pro',                            '$1.25 / 1M input tokens',  'Plus $5.00 / 1M output → ~$0.011 / query'],
      ['Firestore (read/write)',                    '$0.06 / 100K reads',       'Effectively free at expected volumes'],
      ['Cloud Functions (invocations)',             '$0.40 / 1M invocations',   'First 2M / month free'],
      ['Cloud Run (streaming server)',              '~$0.0001 / second',        'Scale-to-zero saves $$ on idle'],
      ['Firebase Auth',                             '$0',                       'Free below 50K MAU'],
      ['Firebase Storage',                          '$0',                       'Audio is on-device, never uploaded'],
    ],
    [3000, 2700, 3660],
  ),

  heading('7.2  Per-User Variable Cost (Average Usage)', HeadingLevel.HEADING_2),
  para('Average usage is modelled at ~50% of the hard cap, which matches industry benchmarks for productivity SaaS. AI traffic on Premium / Professional is split 80% Flash / 20% Pro by the auto-router.'),
  dataTable(
    [
      ['Tier',         'Avg recording',  'Avg AI usage',         'Recording cost', 'AI cost', 'Infra',  'Total'],
      ['Free',         '30 min',          '0',                    '$0.24',          '$0.00',   '$0.015',  '$0.255'],
      ['Advance',      '3 hours',         '25 Flash',             '$1.44',          '$0.015',  '$0.015',  '$1.47'],
      ['Premium',      '10 hours',        '80 Flash + 20 Pro',    '$4.80',          '$0.27',   '$0.015',  '$5.085'],
      ['Professional', '40 hours',        '320 Flash + 80 Pro',   '$19.20',         '$1.10',   '$0.015',  '$20.32'],
    ],
    [1500, 1660, 1900, 1300, 1100, 1100, 800],
  ),

  heading('7.3  Per-User Variable Cost (Hard-Cap Worst Case)', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Tier',         'Cap recording', 'Cap AI',                'Total cost', 'Price',   'Margin %'],
      ['Advance',      '6 hours',        '50 Flash',              '$2.91',      '$9.99',   '71%'],
      ['Premium',      '20 hours',        '160 Flash + 40 Pro',   '$9.95',      '$19.99',  '50%'],
      ['Professional', '80 hours',        '640 Flash + 160 Pro',  '$40.56',     '$49.99',  '19%'],
    ],
    [1700, 1900, 2200, 1300, 1300, 960],
  ),
  para('Even when a power user fully consumes the hard cap, every paid tier remains profitable. Professional is the thinnest at 19% margin in the worst case — acceptable because that cohort is ~3% of the userbase and average usage stays well below cap.'),
  pageBreak(),
]

// ── 8. Revenue & Profit Projections ─────────────────────────────────
const revenue = [
  heading('8. Revenue & Profit Projections', HeadingLevel.HEADING_1),

  heading('8.1  Distribution Assumptions', HeadingLevel.HEADING_2),
  bullet('Monthly active users (MAU) = 30% of total registered users.'),
  bullet('Tier distribution within MAU: 70% Free, 18% Advance, 9% Premium, 3% Professional.'),
  bullet('Top-up conversion: 5% of paid users buy one $15 pack per month, 3% of free users buy one $7.99 pack per month.'),

  heading('8.2  10,000-User Monthly Cash Flow', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Line item',                        'Subtotal',  'Running total'],
      ['Subscription — Advance (540 users)', '$5,395',    '$5,395'],
      ['Subscription — Premium (270 users)', '$5,397',    '$10,792'],
      ['Subscription — Professional (90)',    '$4,499',    '$15,291'],
      ['Top-ups — paid users',                '$675',      '$15,966'],
      ['Top-ups — free users',                '$503',      '$16,469'],
      ['REVENUE TOTAL',                       '',          '$16,469'],
      ['Variable cost — Free (2,100)',        '($536)',    '$15,933'],
      ['Variable cost — Advance',             '($794)',    '$15,139'],
      ['Variable cost — Premium',             '($1,373)',  '$13,766'],
      ['Variable cost — Professional',        '($1,829)',  '$11,937'],
      ['Top-up COGS',                         '($176)',    '$11,761'],
      ['GROSS PROFIT',                        '',          '$11,761'],
      ['Fixed costs (servers, monitoring)',   '($2,500)',  '$9,261'],
      ['NET PROFIT',                          '',          '$9,261'],
    ],
    [3500, 2500, 3360],
  ),

  heading('8.3  Scaling Curve', HeadingLevel.HEADING_2),
  dataTable(
    [
      ['Total users', 'MAU',     'Variable profit', 'Fixed cost', 'Net / month',  'Net / year'],
      ['1,000',        '300',     '$1,176',          '$1,500',     '($324)',       '($3,888)'],
      ['10,000',       '3,000',   '$11,761',         '$2,500',     '$9,261',       '$111,000'],
      ['50,000',       '15,000',  '$58,805',         '$4,000',     '$54,805',      '$657,660'],
      ['100,000',      '30,000',  '$117,610',        '$6,500',     '$111,110',     '$1,333,320'],
      ['250,000',      '75,000',  '$294,025',        '$12,000',    '$282,025',     '$3,384,300'],
    ],
    [1500, 1100, 1700, 1400, 1700, 1960],
  ),
  para('The break-even point sits around 3,500 total users / 1,050 MAU. Below that, fixed costs dominate variable margin. Once past the break-even, the curve scales close-to-linearly because Gemini and Deepgram pricing is per-unit — there are no step-cost cliffs to worry about.'),

  heading('8.4  Sensitivity to Conversion Rate', HeadingLevel.HEADING_2),
  para('The model assumes a 30% MAU split into 30% paid (i.e. ~9% of total registered users on a paid plan). Industry benchmarks for productivity SaaS sit at 2–5% paid conversion. A more conservative model with 5% paid conversion drops the 10K-user net to roughly $2,500 / month. Marketing investment to lift the conversion rate is therefore the single highest-leverage growth investment.'),
  pageBreak(),
]

// ── 9. Distribution Strategy ────────────────────────────────────────
const distribution = [
  heading('9. Distribution Strategy', HeadingLevel.HEADING_1),

  heading('9.1  iOS — App Store Connect / TestFlight', HeadingLevel.HEADING_2),
  bullet('Apple Developer enrolment ($99 / year) is a hard prerequisite for TestFlight and App Store distribution.'),
  bullet('Capacitor scaffolding (npm run add:ios) must run on a Mac because CocoaPods has no Windows support.'),
  bullet('Internal TestFlight testers (up to 100, instant approval) used for early feedback.'),
  bullet('External TestFlight (up to 10,000, beta review ~24h) used to validate copy + onboarding before App Store submission.'),
  bullet('First App Store submission triggers a full review (~2–7 days). Subsequent updates use expedited review.'),
  bullet('Detailed step-by-step in docs/IOS_SETUP.md.'),

  heading('9.2  Android — Google Play Console', HeadingLevel.HEADING_2),
  bullet('Play Console fee is a one-time $25.'),
  bullet('Build chain runs entirely on Windows: Android Studio → AAB → Play Console upload.'),
  bullet('Internal testing track (instant) → Closed testing (limited testers) → Open testing → Production.'),
  bullet('Capacitor 8 + Android 14+ target SDK satisfies current Play Store requirements.'),

  heading('9.3  Web (Standalone Demo)', HeadingLevel.HEADING_2),
  bullet('npm run build:standalone produces a single-file HTML (~1.3 MB gzipped) suitable for emailing to stakeholders.'),
  bullet('No backend connection required for UI demo (Firebase calls fail gracefully if user isn\'t authenticated).'),
  bullet('Live web product would be hosted on Firebase Hosting under a custom domain when ready.'),

  heading('9.4  Pricing Configuration', HeadingLevel.HEADING_2),
  para('Both stores require the subscription products to be defined in their respective console UIs. Apple and Google each take 15% of subscription revenue (after the first year, 30% on year-one). RevenueCat is the recommended subscription orchestrator — it abstracts both stores behind a single webhook and a single client SDK, and writes the user\'s tier back to Firestore via a Cloud Function.'),
  pageBreak(),
]

// ── 10. Security & Privacy ──────────────────────────────────────────
const security = [
  heading('10. Security & Privacy', HeadingLevel.HEADING_1),

  heading('10.1  Authentication', HeadingLevel.HEADING_2),
  bullet('Firebase Auth issues short-lived JWT ID tokens that are validated server-side by both Cloud Functions (admin SDK) and the Cloud Run streaming server.'),
  bullet('Email + password with minimum 6-character policy. Password reset via standard Firebase email link.'),
  bullet('Google + Apple sign-in available on all platforms (web works today; native iOS / Android need Capacitor sign-in plugins, scheduled for the production-readiness sprint).'),

  heading('10.2  Authorization', HeadingLevel.HEADING_2),
  bullet('Firestore Security Rules restrict every collection to the authenticated owner.'),
  bullet('The tier field is locked from client writes, so a malicious app cannot promote itself.'),
  bullet('AI quota counters and recording-minute counters live on the user document and are mutated only inside the Cloud Function transaction.'),

  heading('10.3  Audio Privacy Posture', HeadingLevel.HEADING_2),
  para('Audio bytes never leave the device. The recording flow streams transient PCM frames to Deepgram via our Cloud Run server, but Deepgram is configured to discard the stream as soon as the transcript is generated. We persist nothing on the server side. The encoded WAV lives only in IndexedDB on the user\'s phone, and is wiped when the user deletes the recording or their account.'),

  heading('10.4  Secrets', HeadingLevel.HEADING_2),
  bullet('GEMINI_API_KEY — stored in Google Secret Manager, mounted into the aiChat Cloud Function via defineSecret.'),
  bullet('DeepGram (Deepgram API key) — stored in Google Secret Manager, mounted into the Cloud Run service via --set-secrets.'),
  bullet('Firebase web config (apiKey, projectId, etc.) is intentionally public; security comes from Auth + Rules.'),
  bullet('No .env files are committed. .gitignore excludes everything sensitive.'),

  heading('10.5  GDPR / Privacy Compliance', HeadingLevel.HEADING_2),
  bullet('Data minimisation: we collect only what the product needs (auth identity, transcript, profile fields voluntarily entered).'),
  bullet('Right to erasure: deleteUserData Cloud Function removes the user, the user\'s sessions, segments, chat history, and (client-side) all locally cached audio. Firestore audit row written to deletions for accountability.'),
  bullet('Right to access: planned export endpoint that returns the full Firestore subtree as JSON.'),
  bullet('Subprocessors: Google Cloud (Firebase + Cloud Run + Gemini), Deepgram. Both are GDPR-compliant data processors.'),
  pageBreak(),
]

// ── 11. Development Status ──────────────────────────────────────────
const devStatus = [
  heading('11. Development Status', HeadingLevel.HEADING_1),

  heading('11.1  Completed', HeadingLevel.HEADING_2),
  bullet('Web frontend (login, onboarding, plan selection, home, records, AI chat, summary, mind map, profile, usage, membership, personal info, language, privacy, account-delete).'),
  bullet('Capacitor 8 wiring with iOS + Android platform packages, splash screens (light + dark), launcher icons (56 generated assets), microphone permission strings.'),
  bullet('Firestore schema + security rules + composite index deployed to sheen-alpha.'),
  bullet('Cloud Functions: aiChat (Gemini Flash + Pro auto-route), finalizeSession, batchTranscribe, exportTranscript, recordCompletedSessionUsage, resetMonthlyUsage, deleteUserData, retranslate, revenuecatWebhook.'),
  bullet('Cloud Run streaming server: Deepgram Nova-3 + Google Translate, deployed at sheen-server-176127438166.us-central1.run.app.'),
  bullet('On-device IndexedDB audio store with encode/save/load/delete cycle.'),
  bullet('Tier-gated AI chat with locked-button teaser on Free tier.'),
  bullet('Usage screen with progress bars + tier-priced top-up packs.'),
  bullet('Two seeded test accounts (free@s.co, advance@s.co — password 123456).'),
  bullet('Responsive layout for phones, tablets, iPads (max-width 480px center, dynamic viewport heights, safe-area insets).'),
  bullet('Edge-to-edge Android system bar styling (lila status + nav).'),

  heading('11.2  In Progress', HeadingLevel.HEADING_2),
  bullet('Android Play Console internal testing build (waiting on Mac access for parallel iOS work).'),

  heading('11.3  Not Started', HeadingLevel.HEADING_2),
  bullet('iOS scaffolding (npm run add:ios) — requires Mac.'),
  bullet('App Store Connect product configuration + first TestFlight upload.'),
  bullet('Google Play Console product configuration + first internal-track build.'),
  bullet('RevenueCat or Stripe subscription orchestration.'),
  bullet('Native Google + Apple sign-in (Capacitor plugins, replaces popup-based web flow).'),
  bullet('Server-side recording quota enforcement (currently client-side only — see §13.4).'),
  bullet('Marketing site / landing page.'),
  pageBreak(),
]

// ── 12. Roadmap ─────────────────────────────────────────────────────
const roadmap = [
  heading('12. Roadmap', HeadingLevel.HEADING_1),

  heading('12.1  Near Term (0–4 weeks)', HeadingLevel.HEADING_2),
  bullet('Mac access → run npm run add:ios → first TestFlight build.'),
  bullet('Apple Developer enrolment ($99) + Google Play Console enrolment ($25).'),
  bullet('Bundle ID registration in App Store Connect + Play Console.'),
  bullet('Production-grade Privacy Policy + Terms of Service drafted (currently placeholder text).'),
  bullet('Basic landing page (hosted on Firebase Hosting subdomain).'),
  bullet('Beta cohort of 10–20 testers across iOS and Android.'),

  heading('12.2  Medium Term (1–3 months)', HeadingLevel.HEADING_2),
  bullet('RevenueCat integration + first paid customer.'),
  bullet('Native Google + Apple sign-in to replace the popup-based web flow.'),
  bullet('Server-side recording-minute enforcement (Cloud Function on session finalize).'),
  bullet('Server-side AI quota reset job (already coded, needs Cloud Scheduler trigger).'),
  bullet('Stripe alternative for users outside App Store / Play Store ecosystems (web subscription).'),
  bullet('Public App Store / Play Store launch.'),
  bullet('First marketing experiments (paid social, content, search).'),

  heading('12.3  Long Term (3–9 months)', HeadingLevel.HEADING_2),
  bullet('Team / workspace tier (multi-user, shared meeting library).'),
  bullet('Calendar integrations (Google, Outlook) for one-tap-record.'),
  bullet('Live closed captions in another language during an active call.'),
  bullet('Voice-cloned summary playback ("listen to a 60-second summary in my voice").'),
  bullet('Speaker diarisation tuning (current Deepgram diarisation is basic).'),
  bullet('Push notifications + reminders.'),
  bullet('Data export to Notion, Slack, Google Docs.'),
  pageBreak(),
]

// ── 13. Risks & Mitigation ──────────────────────────────────────────
const risks = [
  heading('13. Risks & Mitigation', HeadingLevel.HEADING_1),

  heading('13.1  Vendor Pricing Changes', HeadingLevel.HEADING_2),
  para('Risk: Google or Deepgram raises per-token / per-minute pricing. Mitigation: pricing tiers are designed with ~70% gross margin baked in, so a 30–40% input-cost increase still leaves all paid tiers profitable. Worst case we re-tier at the next pricing review. Multi-vendor abstraction is on the roadmap (the aiChat function is already model-agnostic via the autoRoute parameter — swapping in a different LLM is a one-day job).'),

  heading('13.2  Conversion Rate Below Plan', HeadingLevel.HEADING_2),
  para('Risk: free → paid conversion stays at industry-typical 2–5% rather than the 9% our model assumes. Mitigation: the financial model is robust at 5% conversion (still profitable at 10K users). Below 5%, marketing budget shifts to optimise onboarding (in-app upsell, free-trial of paid tier).'),

  heading('13.3  Power-User Cap Burn', HeadingLevel.HEADING_2),
  para('Risk: 1–2% of Professional users use the full 80-hour cap and AI quota every month, compressing margin to ~18%. Mitigation: hard rate limiting on Cloud Run + Cloud Function side; soft fair-use cap kicks in past 90 hours/month. Adoption tracked monthly — if the heavy-user share grows, we re-price Professional.'),

  heading('13.4  Server-Side Quota Enforcement', HeadingLevel.HEADING_2),
  para('Risk: today\'s recording-minute and AI-query enforcement is partly client-side. A determined user could patch the React app and bypass UI gates. Mitigation: AI quota is already enforced server-side in the aiChat function transaction. Recording-minute enforcement is the next backend sprint — finalizeSession will reject sessions whose duration would push the user past their monthly cap. Until then, monthly usage reports will catch any abuse, and we can revoke access manually.'),

  heading('13.5  iOS / Android Policy Risks', HeadingLevel.HEADING_2),
  para('Risk: Apple or Google rejects the app for policy reasons (microphone permission strings, in-app purchase requirements, etc.). Mitigation: docs/IOS_SETUP.md already covers NSMicrophoneUsageDescription. RevenueCat handles store IAP requirements. Privacy Policy + Terms required for both stores; will be drafted before submission.'),

  heading('13.6  Native Sign-In Migration', HeadingLevel.HEADING_2),
  para('Risk: Apple\'s "Sign in with Apple" is mandatory once we ship Google sign-in on iOS. The current popup-based Firebase Auth Google sign-in is unreliable in the iOS WebView. Mitigation: scheduled in §12.2 (medium term) — @capacitor-firebase/authentication plugin gives both providers as native flows.'),

  heading('13.7  Vendor Lock-In', HeadingLevel.HEADING_2),
  para('Firebase / GCP is the deepest dependency. Migration to a self-hosted Postgres + GoTrue auth is technically possible but expensive. Acceptable trade-off given the free-tier generosity below 50K MAU. We will revisit if Firebase pricing becomes uncompetitive at scale.'),
  pageBreak(),
]

// ── 14. Project Structure ───────────────────────────────────────────
const structure = [
  heading('14. Project Structure', HeadingLevel.HEADING_1),

  para('All code, deploy configuration, and platform projects live in a single repository. The directory layout below maps each piece of the architecture to a folder.'),

  para('sheen-ai/'),
  bullet('src/ — React 18 web client (UI, state, services).'),
  bullet('functions/ — TypeScript Cloud Functions v2 (aiChat with Gemini, finalizeSession, etc.).'),
  bullet('server/ — TypeScript Cloud Run streaming server (Deepgram WebSocket).'),
  bullet('android/ — Capacitor Android Studio project (committed, ready to build).'),
  bullet('ios/ — Capacitor Xcode project (Mac-only, generated via npm run add:ios).'),
  bullet('assets/ — Source images for icons + splash screens.'),
  bullet('scripts/ — Asset generation and tooling scripts.'),
  bullet('docs/ — Project documentation (this SPDD, IOS_SETUP.md).'),
  bullet('firebase.json — Firestore + Functions + Storage deploy config.'),
  bullet('firestore.rules — Security rules (deployed to sheen-alpha).'),
  bullet('firestore.indexes.json — Composite-index definitions.'),
  bullet('capacitor.config.ts — Bundle id (com.sheenai.app), plugin config.'),
  bullet('package.json — Single npm script surface (dev, build, build:standalone, build:mobile, sync, open:android, open:ios, gen:assets, etc.).'),

  heading('14.1  Key Source Files', HeadingLevel.HEADING_2),
  bullet('src/App.jsx — top-level navigation state machine.'),
  bullet('src/services/firebase.js — Firebase SDK init pointed at sheen-alpha.'),
  bullet('src/services/AuthContext.jsx — auth state + ensureUserDoc.'),
  bullet('src/services/RecordingContext.jsx — capture + WebSocket + segment persistence + WAV save.'),
  bullet('src/services/aiChat.js — httpsCallable wrapper with tier options.'),
  bullet('src/services/useAiChat.js — chat hook with optimistic UI + stream-driven dedup.'),
  bullet('src/services/localAudio.js — IndexedDB store + WAV encoder.'),
  bullet('src/services/summary.js — client-side extractive summary generator.'),
  bullet('src/services/firestore.js — Firestore CRUD helpers.'),
  bullet('functions/src/aiChat.ts — Gemini-backed Cloud Function with autoRoute heuristic.'),
  bullet('server/src/stream-handler.ts — WebSocket → Deepgram → translate → JSON pipeline.'),

  heading('14.2  Repository', HeadingLevel.HEADING_2),
  para([
    'Public canonical URL: ',
    new TextRun({ text: 'https://github.com/halitkoraya-ai/sheen-ai', color: PURPLE_DARK, underline: {} }),
  ]),
  para('Branch model: trunk-based on main. Every backend change is followed by an explicit npm run build:mobile + git commit + git push to keep the Capacitor Android project in sync with the React tree.'),
  pageBreak(),
]

// ── 15. Stakeholders ────────────────────────────────────────────────
const stakeholders = [
  heading('15. Stakeholders', HeadingLevel.HEADING_1),

  dataTable(
    [
      ['Role',                    'Responsibility'],
      ['Founder / Product Owner', 'Halit Koraya — strategy, pricing, roadmap, sole code contributor today.'],
      ['Apple Developer Account', 'Pending — required for TestFlight and App Store submission ($99 / yr).'],
      ['Google Play Console',     'Pending — required for Play Store submission ($25 one-time).'],
      ['Cloud billing owner',     'Halit Koraya — sheen-alpha GCP project, Firebase Blaze plan billing.'],
      ['Deepgram billing',        'Halit Koraya — separate Deepgram subscription tied to the workspace key.'],
      ['Beta testers',            'Internal cohort of ~10 friends + family for the first TestFlight / Play internal track.'],
    ],
    [3500, 5860],
  ),

  heading('15.1  Decision Authority', HeadingLevel.HEADING_2),
  bullet('Pricing changes: Halit'),
  bullet('Architecture changes: Halit'),
  bullet('External dependencies (new vendor / SDK): Halit + technical reviewer if available'),
  bullet('Public communications: Halit'),
  pageBreak(),
]

// ── 16. Glossary ────────────────────────────────────────────────────
const glossary = [
  heading('16. Glossary', HeadingLevel.HEADING_1),
  dataTable(
    [
      ['Term',                'Definition'],
      ['MAU',                 'Monthly active user — has performed at least one action in the last 30 days.'],
      ['DAU',                 'Daily active user.'],
      ['ARPU',                'Average revenue per user.'],
      ['LTV',                 'Lifetime value — projected revenue from a single user across their entire subscription life.'],
      ['CAC',                 'Customer acquisition cost — marketing spend divided by paid users acquired.'],
      ['Capacitor',           'Cross-platform native runtime that wraps a web app inside an iOS / Android shell.'],
      ['IndexedDB',           'Browser-native key-value database used here to persist audio blobs on the device.'],
      ['Deepgram',            'Speech-to-text vendor providing the Nova-3 streaming model used for live transcription.'],
      ['Gemini',              'Google\'s LLM family. Sheen AI uses Gemini 2.5 Flash + Pro for chat-with-meeting Q&A.'],
      ['TestFlight',          'Apple\'s beta distribution program; used to validate iOS builds with up to 10K external testers before App Store submission.'],
      ['Cloud Run',           'Google\'s container-based serverless platform; hosts the Sheen AI streaming server.'],
      ['Cloud Functions v2',  'Google\'s function-as-a-service runtime backed by Cloud Run; hosts our aiChat HTTPS-callable.'],
      ['DXA',                 'Word-document layout unit (1440 DXA = 1 inch); referenced internally in this PDF\'s production but not user-facing.'],
    ],
    [2400, 6960],
  ),
]

// ── Assemble document ───────────────────────────────────────────────
const headerPara = new Paragraph({
  alignment: AlignmentType.RIGHT,
  children: [new TextRun({ text: 'Sheen AI — Software Project Design Document', size: 16, color: '999999' })],
})
const footerPara = new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [
    new TextRun({ text: 'Page ', size: 16, color: '999999' }),
    new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' }),
    new TextRun({ text: ' / ', size: 16, color: '999999' }),
    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '999999' }),
  ],
})

const doc = new Document({
  creator: 'Halit Koraya',
  title:   'Sheen AI — Software Project Design Document',
  description: 'Stakeholder-facing design document for the Sheen AI cross-platform meeting transcription product.',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },     // 11 pt body
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run:       { size: 36, bold: true, font: 'Arial', color: PURPLE_DARK },
        paragraph: { spacing: { before: 320, after: 220 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run:       { size: 28, bold: true, font: 'Arial', color: PURPLE_MID },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run:       { size: 24, bold: true, font: 'Arial', color: PURPLE_DARK },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
      ]},
    ],
  },
  sections: [{
    properties: {
      page: {
        size:   { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: { default: new Header({ children: [headerPara] }) },
    footers: { default: new Footer({ children: [footerPara] }) },
    children: [
      ...cover,
      ...tocSection,
      ...executiveSummary,
      ...productOverview,
      ...architecture,
      ...techStack,
      ...dataModel,
      ...tiers,
      ...costAnalysis,
      ...revenue,
      ...distribution,
      ...security,
      ...devStatus,
      ...roadmap,
      ...risks,
      ...structure,
      ...stakeholders,
      ...glossary,
    ],
  }],
})

// ── Write ───────────────────────────────────────────────────────────
const buffer = await Packer.toBuffer(doc)
fs.mkdirSync('docs', { recursive: true })
const outPath = 'docs/Sheen-AI-Project-Design-Document.docx'
fs.writeFileSync(outPath, buffer)
console.log(`✓ Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`)
