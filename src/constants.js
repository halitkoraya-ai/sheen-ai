// ── Color Palette ────────────────────────────────────────────────────
export const C = {
  bg:  '#E6DFED',  // Background — primary light lila
  bg2: '#DCD9DD',  // Background — secondary grey-lila
  bg3: '#CFCDD1',  // Background — shadow/depth tone
  p4:  '#D8C8E9',  // Particle — outermost / faintest
  p5:  '#BDA2DA',  // Particle — light lavender
  p6:  '#A28DB7',  // Particle — mid-light purple
  p7:  '#8163A3',  // Particle — medium purple
  p8:  '#613A8A',  // Particle — deep purple (core)
  p9:  '#4A2070',  // Logo button — dark purple base
}

export const FONTS = {
  heading: "'Sora', sans-serif",
  body:    "'DM Sans', sans-serif",
}

// ── Native shell detection ──────────────────────────────────────────
// True when running inside a Capacitor iOS / Android shell. Used to
// flip layout primitives (fixed pixel heights designed for the 375x812
// web mockup vs. dynamic viewport heights that fill any device screen).
export const IS_NATIVE = (() => {
  try {
    if (typeof window === 'undefined') return false
    const cap = window.Capacitor
    if (!cap) return false
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform()
    return cap.platform === 'ios' || cap.platform === 'android'
  } catch { return false }
})()

// Layout helpers — return the right unit depending on environment.
//
// On the desktop preview we keep the original 375x812 iPhone mockup so
// the marketing/preview frame reads as a polished prototype. On native
// we fall back to viewport units (`dvh` = dynamic viewport height,
// shrinks/grows when iOS Safari toolbars appear/disappear) so the app
// fills the device screen no matter what.
//
// `mockupHeight` is the width-mockup constant (e.g. 722, 700, 812).
// `screenMinHeight(700)` → 700 on web, '100dvh' on native.
// `screenHeight(722)` → 722 on web, '100dvh' on native.
// `scrollMaxHeight(680)` → 680 on web, 'calc(100dvh - 100px)' on native.
export const screenHeight    = (mockupHeight) => IS_NATIVE ? '100dvh'                      : mockupHeight
export const screenMinHeight = (mockupHeight) => IS_NATIVE ? '100dvh'                      : mockupHeight
export const scrollMaxHeight = (mockupHeight) => IS_NATIVE ? `calc(100dvh - 100px)`        : mockupHeight

// ── Shared style factory functions ───────────────────────────────────
export const gradientButton = (overrides = {}) => ({
  width: '100%',
  padding: '14px 0',
  background: `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
  color: '#fff',
  border: 'none',
  borderRadius: 14,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONTS.heading,
  letterSpacing: 0.2,
  ...overrides,
})

export const glassCard = (overrides = {}) => ({
  background: 'rgba(255,255,255,0.72)',
  borderRadius: 16,
  padding: 16,
  border: `1.5px solid ${C.p4}`,
  marginBottom: 12,
  ...overrides,
})

export const glassInput = (overrides = {}) => ({
  width: '100%',
  background: 'rgba(255,255,255,0.72)',
  border: `1.5px solid ${C.p4}`,
  borderRadius: 14,
  padding: '13px 16px',
  fontSize: 15,
  color: C.p9,
  outline: 'none',
  fontFamily: FONTS.body,
  ...overrides,
})

// Subscription plans — pricing reflects the unit economics of Deepgram
// (streaming transcription) plus a smart-routed AI stack.
//
// Cost model (per MAU at average usage):
//   Deepgram + Cloud Run : $0.008 / minute of audio (~$0.48 / hour)
//   Gemini 2.5 Flash     : ~$0.0006 / query  (default, ~80% of traffic)
//   DeepSeek V3 (chat)   : ~$0.0019 / query  (medium reasoning, ~15%)
//   DeepSeek R1 (reason) : ~$0.0038 / query  (deep analysis, ~5%)
//   Gemini 2.5 Pro       : ~$0.011 / query   (multimodal / very-long
//                          context fallback — not routed by default)
//   Firestore + Functions: ~$0.05 / MAU (fixed, ignorable)
//
// Routing happens server-side in functions/src/aiChat.ts: a free
// regex pre-filter handles obvious simple/complex cases; ambiguous
// questions get a 1-shot Flash classification (~$0.00005 each) that
// picks the right model. The `models` array below mirrors the
// server-side TIER_MODELS table — keep them in sync when retiering.
//
// Hard caps below sit above expected average usage with healthy margin
// while staying break-even at the worst case (full-cap power user).
// Feature copy keeps model names hidden from the user — "AI assistant"
// reads cleaner and lets us swap providers later without re-marketing.
export const PLANS = [
  {
    id: 'free',
    title: 'Free',
    price: 'Free',
    pricePerMonth: 0,
    iconName: 'sparkle',
    features: [
      '1 hour of recording per month',
      'Live transcription + translation',
      'On-device audio storage',
      'Extractive summary',
      'Mind map of your meetings',
    ],
    limits: {
      recordingMinutesPerMonth: 60,
      aiChatQueriesPerMonth:    0,
      deepSummariesPerMonth:    0,
      models:                   [],
      autoRoute:                false,
      priority:                 false,
    },
  },
  {
    id: 'advance',
    title: 'Advance',
    price: '$9.99/mo',
    pricePerMonth: 9.99,
    iconName: 'rocket',
    features: [
      '6 hours of recording per month',
      'AI assistant',
      'Smart mind map with sub-branches',
      'Email support',
    ],
    limits: {
      recordingMinutesPerMonth: 360,
      aiChatQueriesPerMonth:    50,
      deepSummariesPerMonth:    10,
      models:                   ['flash'],
      autoRoute:                false,
      priority:                 false,
    },
  },
  {
    id: 'premium',
    title: 'Premium',
    price: '$19.99/mo',
    pricePerMonth: 19.99,
    iconName: 'crown',
    features: [
      '20 hours of recording per month',
      'AI assistant — more usage',
      'Auto-routed to deeper model when needed',
      'Faster response times',
      'Priority chat support',
    ],
    limits: {
      recordingMinutesPerMonth: 1200,
      aiChatQueriesPerMonth:    200,
      deepSummariesPerMonth:    50,
      models:                   ['flash', 'v3', 'r1'],
      autoRoute:                true,
      priority:                 false,
    },
  },
  {
    id: 'professional',
    title: 'Professional',
    price: '$49.99/mo',
    pricePerMonth: 49.99,
    iconName: null,
    dark: true,
    features: [
      '80 hours of recording per month',
      'AI assistant — premium usage',
      'Unlimited deep AI summaries',
      'Highest-priority response queue',
      'Dedicated email support',
    ],
    limits: {
      recordingMinutesPerMonth: 4800,
      aiChatQueriesPerMonth:    800,
      deepSummariesPerMonth:    -1,    // -1 = unlimited
      models:                   ['flash', 'v3', 'r1', 'pro'],
      autoRoute:                true,
      priority:                 true,
    },
  },
]

// Look up a plan + its limits by tier id. Falls back to the Free tier so
// gating logic always has something concrete to compare against.
export const planForTier = (tier) =>
  PLANS.find(p => p.id === tier) || PLANS[0]
export const limitsForTier = (tier) =>
  planForTier(tier).limits

// One-shot top-up packs — extra recording hours that include a pro-rated
// AI quota (~5 queries / hour, matching the typical question-per-recording
// pattern we see in usage logs).
//
// Pricing is tier-dependent on purpose: a Free user pays the steepest
// per-hour rate, so subscribing to Advance (6h for $9.99) is always
// strictly cheaper than topping up the same hours. We want the
// subscription to win every direct comparison; top-ups are a relief
// valve, not a replacement for the recurring plan.
// The ladder is intentionally steep: per-hour cost drops the more the
// user buys at once, so 15h is a much better deal than three 5h packs.
// Subscription is still strictly cheaper per hour than any top-up at the
// same tier — top-ups remain a relief valve, not a path that beats the
// recurring plan.
//
// Per-hour effective rates (free → professional):
//   2 hr pack : $4.00 / $2.50 / $2.00 / $1.50
//   5 hr pack : $3.00 / $2.00 / $1.60 / $1.00
//   15 hr pack: $2.33 / $1.53 / $1.20 / $0.80
export const TOPUP_PACKAGES = [
  {
    id:    'small',
    hours: 2,
    aiQueries: 10,
    priceByTier: { free: 7.99,  advance: 4.99,  premium: 3.99,  professional: 2.99 },
  },
  {
    id:    'medium',
    hours: 5,
    aiQueries: 25,
    priceByTier: { free: 14.99, advance: 9.99,  premium: 7.99,  professional: 4.99 },
  },
  {
    id:    'large',
    hours: 15,
    aiQueries: 75,
    priceByTier: { free: 34.99, advance: 22.99, premium: 17.99, professional: 11.99 },
  },
]
export const topupPriceFor = (pkg, tier) =>
  pkg?.priceByTier?.[tier] ?? pkg?.priceByTier?.free ?? 0
