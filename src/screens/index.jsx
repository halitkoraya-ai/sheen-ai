import { useEffect, useMemo, useRef, useState } from 'react'
import { C, FONTS, gradientButton, glassCard, glassInput, PLANS, limitsForTier, TOPUP_PACKAGES, topupPriceFor } from '../constants.js'
import { Logo, Header, BottomNav, PlanCard, CheckIcon, Icon } from '../components/index.jsx'
import {
  signInWithEmail, signInWithGoogle, signInWithApple, signUpWithEmail,
  sendPasswordReset, friendlyAuthError,
  updateDisplayName as updateDisplayNameInAuth,
} from '../services/auth.js'
import {
  updateOnboardingProfile, updateUser,
  tierLabel, languageLabel, SUPPORTED_LANGUAGES,
  getSession, renameSession, markSessionViewed, deleteSession,
  subscribeSegments,
} from '../services/firestore.js'
import { getAudioUrl as getLocalAudioUrl } from '../services/localAudio.js'
import { useAuth } from '../services/AuthContext.jsx'
import { useSessions } from '../services/useSessions.js'
import { generateSummaryFor } from '../services/summary.js'
import { useAiChat } from '../services/useAiChat.js'

// ── Reference data — countries & occupations ─────────────────────────
// Lists mirror lib/screens/onboarding/onboarding_profile_screen.dart so the
// values written to Firestore are consistent across web and Flutter clients.
const COUNTRIES = [
  'Turkey', 'Russia', 'UAE', 'Kazakhstan', 'Uzbekistan', 'Azerbaijan',
  'USA', 'UK', 'Germany', 'China', 'Japan', 'Korea', 'Other',
]

const OCCUPATIONS = [
  'Business', 'Engineering', 'Legal', 'Medical',
  'Education/Student', 'Government', 'Other',
]

// Map ISO region codes from the device locale onto the country labels above.
// Used to pre-select a sensible default in the onboarding dropdown.
const REGION_TO_COUNTRY = {
  TR: 'Turkey',  RU: 'Russia',  AE: 'UAE',         KZ: 'Kazakhstan',
  UZ: 'Uzbekistan', AZ: 'Azerbaijan',
  US: 'USA',     GB: 'UK',      DE: 'Germany',
  CN: 'China',   JP: 'Japan',   KR: 'Korea',
}

const DEVICE_COUNTRY = (() => {
  if (typeof navigator === 'undefined') return ''
  const tag = navigator.language || (navigator.languages && navigator.languages[0]) || ''
  if (!tag) return ''
  let region = tag.split('-')[1]
  if (!region) {
    try { region = new Intl.Locale(tag).maximize().region } catch {}
  }
  return REGION_TO_COUNTRY[(region || '').toUpperCase()] || ''
})()

// Inline styled <select> that matches the glassCard look — used by the onboarding screen.
const InlineSelect = ({ value, placeholder, options, onChange }) => (
  <div style={{ ...glassCard({ position: 'relative', padding: 0, marginBottom: 14, overflow: 'hidden' }) }}>
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        background: 'transparent', border: 'none', outline: 'none',
        padding: '13px 40px 13px 16px',
        fontSize: 14, color: value ? C.p9 : C.p6,
        fontFamily: FONTS.body, cursor: 'pointer',
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
    >
      <path d="M6 9l6 6 6-6" stroke={C.p6} strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
)

// ── LOGIN ────────────────────────────────────────────────────────────
// Wired to Firebase Auth (mirrors lib/screens/auth/login_screen.dart).
// Auth state is observed by AuthContext, so successful sign-in automatically
// transitions the app to the next screen — this component just kicks off
// the sign-in call and surfaces errors.
export const LoginScreen = ({ onPrivacy, onAgreement }) => {
  const [mode, setMode]       = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [busyGoogle, setBusyGoogle] = useState(false)
  const [busyApple,  setBusyApple]  = useState(false)
  const [error, setError]     = useState(null)
  const [info, setInfo]       = useState(null)
  const anyBusy = loading || busyGoogle || busyApple

  const isSignup = mode === 'signup'

  const submit = async () => {
    setError(null); setInfo(null)
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    if (isSignup && !name.trim()) {
      setError('Please enter your name.')
      return
    }
    setLoading(true)
    try {
      if (isSignup) {
        await signUpWithEmail({ email: email.trim(), password, displayName: name.trim() })
      } else {
        await signInWithEmail({ email: email.trim(), password })
      }
      // AuthContext handles navigation on auth state change.
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setLoading(false)
    }
  }

  const submitGoogle = async () => {
    setError(null); setInfo(null); setBusyGoogle(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setBusyGoogle(false)
    }
  }

  const submitApple = async () => {
    setError(null); setInfo(null); setBusyApple(true)
    try {
      await signInWithApple()
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setBusyApple(false)
    }
  }

  const submitForgot = async () => {
    setError(null); setInfo(null)
    if (!email.trim()) {
      setError('Enter your email first, then tap Forgot Password.')
      return
    }
    try {
      await sendPasswordReset({ email: email.trim() })
      setInfo('Password reset email sent. Check your inbox.')
    } catch (e) {
      setError(friendlyAuthError(e))
    }
  }

  return (
    <div style={{ padding: '0 28px 40px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0 24px' }}>
        <Logo size={84} glow />
        <div style={{ fontFamily: FONTS.heading, fontSize: 26, fontWeight: 700, color: C.p9, marginTop: 12 }}>
          Sheen AI
        </div>
        <div style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body, marginTop: 2 }}>
          {isSignup ? 'Create your account' : 'Welcome back'}
        </div>
      </div>

      {isSignup && (
        <>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
            Name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            style={{ ...glassInput({ marginBottom: 14 }) }}
            autoComplete="name"
          />
        </>
      )}

      <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
        Email
      </label>
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        type="email"
        autoComplete="email"
        style={{ ...glassInput({ marginBottom: 14 }) }}
      />

      <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
        Password
      </label>
      <input
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder={isSignup ? 'At least 6 characters' : 'Enter your password'}
        type="password"
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        style={{ ...glassInput({ marginBottom: isSignup ? 22 : 6 }) }}
      />

      {!isSignup && (
        <div style={{ textAlign: 'right', marginBottom: 14 }}>
          <span
            onClick={submitForgot}
            style={{ fontSize: 12, color: C.p7, cursor: 'pointer', fontFamily: FONTS.body }}
          >
            Forgot Password?
          </span>
        </div>
      )}

      {(error || info) && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          marginBottom: 14,
          fontSize: 12, lineHeight: 1.4,
          fontFamily: FONTS.body,
          background: error ? '#FFE8E8' : '#E8F4FF',
          color: error ? '#B32B2B' : '#1A6FB8',
          border: `1px solid ${error ? '#F4C2C2' : '#BED9F0'}`,
        }}>
          {error || info}
        </div>
      )}

      <button
        onClick={submit}
        disabled={anyBusy}
        style={{ ...gradientButton({ marginBottom: 14, opacity: anyBusy ? 0.65 : 1, cursor: anyBusy ? 'wait' : 'pointer' }) }}
      >
        {loading ? (isSignup ? 'Creating…' : 'Signing in…') : (isSignup ? 'Sign Up' : 'Log In')}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: C.p4 }} />
        <span style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body }}>or continue with</span>
        <div style={{ flex: 1, height: 1, background: C.p4 }} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          onClick={submitGoogle}
          disabled={anyBusy}
          aria-label="Sign in with Google"
          style={{
            flex: 1, padding: '12px 14px',
            borderRadius: 14, border: `1.5px solid ${C.p4}`,
            background: 'rgba(255,255,255,.85)',
            color: C.p9, fontFamily: FONTS.heading, fontSize: 14, fontWeight: 600,
            cursor: anyBusy ? 'wait' : 'pointer',
            opacity: anyBusy ? 0.65 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {busyGoogle ? '…' : 'Google'}
        </button>

        <button
          onClick={submitApple}
          disabled={anyBusy}
          aria-label="Sign in with Apple"
          style={{
            flex: 1, padding: '12px 14px',
            borderRadius: 14, border: `1.5px solid #1a1a1a`,
            background: '#1a1a1a',
            color: 'white', fontFamily: FONTS.heading, fontSize: 14, fontWeight: 600,
            cursor: anyBusy ? 'wait' : 'pointer',
            opacity: anyBusy ? 0.65 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="16" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.77 3.18.8 1.22-.23 2.38-.94 3.68-.84 1.57.13 2.75.76 3.5 1.9-3.22 1.88-2.75 6.05.47 7.4-.68 1.6-1.33 3.04-2.83 3.62zM12.03 7.36c-.14-2.4 1.93-4.37 4.22-4.57.35 2.71-2.47 4.76-4.22 4.57z"/>
          </svg>
          {busyApple ? '…' : 'Apple'}
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 13, color: C.p7, fontFamily: FONTS.body, marginBottom: 16 }}>
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <span
          onClick={() => { setError(null); setInfo(null); setMode(isSignup ? 'signin' : 'signup') }}
          style={{ color: C.p9, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
        >
          {isSignup ? 'Log in' : 'Sign up'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CheckIcon />
        <div style={{ fontSize: 12, color: C.p7, lineHeight: 1.5, fontFamily: FONTS.body }}>
          I have read and agree to the{' '}
          <span onClick={onPrivacy} style={{ color: C.p9, fontWeight: 500, textDecoration: 'underline', cursor: 'pointer' }}>Terms of Service</span>
          {' '}and{' '}
          <span onClick={onAgreement} style={{ color: C.p9, fontWeight: 500, textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>
        </div>
      </div>
    </div>
  )
}

// ── LOGIN 2 — User Info ──────────────────────────────────────────────
// Mirrors lib/screens/onboarding/onboarding_profile_screen.dart.
// Continue → updateOnboardingProfile (writes country/age/occupation/major
//            and onboardingCompleted=true).
// Skip     → updateUser({ onboardingCompleted: true }) — fields stay null.
// onContinue is invoked after the Firestore write succeeds; the parent decides
// whether to route into the optional plan-selection (memberInfo) screen or
// straight home. Skip routes straight home.
export const Login2Screen = ({ onContinue, onSkip }) => {
  const { user, setProfile } = useAuth()
  const [country, setCountry]       = useState(DEVICE_COUNTRY)
  const [age, setAge]               = useState('')
  const [occupation, setOccupation] = useState('')
  const [major, setMajor]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)

  const showMajor = occupation === 'Education/Student'

  const handleContinue = async () => {
    if (!user) return
    setError(null); setSaving(true)
    try {
      const ageNum = age.trim() === '' ? null : Number.parseInt(age, 10)
      await updateOnboardingProfile(user.uid, {
        country: country || null,
        age: Number.isFinite(ageNum) ? ageNum : null,
        occupation: occupation || null,
        major: showMajor && major.trim() ? major.trim() : null,
      })
      // Optimistically update the cached profile so the auth-effect doesn't
      // bounce us back here while Firestore propagates.
      setProfile?.((p) => ({
        ...(p || { uid: user.uid }),
        country: country || null,
        age: Number.isFinite(ageNum) ? ageNum : null,
        occupation: occupation || null,
        major: showMajor && major.trim() ? major.trim() : null,
        onboardingCompleted: true,
      }))
      onContinue?.()
    } catch (e) {
      console.error('[Login2] save failed', e)
      setError('Could not save your info. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    if (!user) { onSkip?.(); return }
    setError(null); setSaving(true)
    try {
      await updateUser(user.uid, { onboardingCompleted: true })
      setProfile?.((p) => ({ ...(p || { uid: user.uid }), onboardingCompleted: true }))
      onSkip?.()
    } catch (e) {
      console.error('[Login2] skip failed', e)
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title="" onBack={handleSkip} />
      <div style={{ padding: '0 28px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="1.8" />
              <path d="M4 20C4 17 7.6 15 12 15C16.4 15 20 17 20 20" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <h2 style={{ textAlign: 'center', fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700, color: C.p9, margin: '0 0 6px' }}>
          Tell us about you
        </h2>
        <p style={{ fontSize: 13, color: C.p6, textAlign: 'center', lineHeight: 1.55, marginBottom: 20, fontFamily: FONTS.body }}>
          This helps us personalize your experience. All fields are optional.
        </p>

        <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 7, textTransform: 'uppercase' }}>Country</label>
        <InlineSelect
          value={country}
          placeholder="Select country"
          options={COUNTRIES}
          onChange={setCountry}
        />

        <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 7, textTransform: 'uppercase' }}>Age</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Enter your age"
          value={age}
          onChange={e => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
          style={{ ...glassInput({ marginBottom: 14 }) }}
        />

        <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 7, textTransform: 'uppercase' }}>Occupation</label>
        <InlineSelect
          value={occupation}
          placeholder="Select occupation"
          options={OCCUPATIONS}
          onChange={setOccupation}
        />

        {/* Major / Field of Study — animated reveal when occupation is Education/Student */}
        <div style={{
          maxHeight: showMajor ? 110 : 0,
          opacity: showMajor ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height .3s ease, opacity .25s ease',
        }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 7, textTransform: 'uppercase' }}>Major / Field of Study</label>
          <input
            type="text"
            placeholder="e.g. Computer Science"
            value={major}
            onChange={e => setMajor(e.target.value)}
            style={{ ...glassInput({ marginBottom: 14 }) }}
          />
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 12,
            fontSize: 12, lineHeight: 1.4, fontFamily: FONTS.body,
            background: '#FFE8E8', color: '#B32B2B', border: '1px solid #F4C2C2',
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <button
            onClick={handleContinue}
            disabled={saving}
            style={gradientButton({ marginBottom: 10, opacity: saving ? 0.65 : 1, cursor: saving ? 'wait' : 'pointer' })}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
          <button
            onClick={handleSkip}
            disabled={saving}
            style={gradientButton({ background: 'transparent', color: C.p6, border: `1px solid ${C.p4}`, opacity: saving ? 0.65 : 1, cursor: saving ? 'wait' : 'pointer' })}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MEMBER INFO — Plan Selection ─────────────────────────────────────
// Onboarding plan-preview step. The Sheen Firestore rules forbid client-side
// writes to `tier`; in the Flutter app, paid tiers are activated server-side
// after a RevenueCat purchase event triggers a Cloud Function (see
// firestore.rules + lib/services/subscription_service.dart). On web we don't
// have that flow yet, so tapping a plan here just continues onboarding —
// real upgrades will land once a payment integration (Stripe / RevenueCat
// web) is wired in. Free tier is the default from ensureUserDoc, no-op.
export const MemberInfoScreen = ({ onDone }) => (
  <div style={{ animation: 'fadeIn .35s ease' }}>
    <div style={{ padding: '16px 28px 4px' }}>
      <div style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 700, color: C.p9, marginBottom: 4 }}>Choose Your Plan</div>
      <div style={{ fontSize: 13, color: C.p6, marginBottom: 16, fontFamily: FONTS.body }}>Start your professional journey — pick the plan that fits you best</div>
    </div>
    <div style={{ padding: '0 28px 24px' }}>
      {PLANS.map(plan => (
        <PlanCard key={plan.id} plan={plan} onPress={() => onDone?.()} />
      ))}
      <div
        onClick={() => onDone?.()}
        style={{
          marginTop: 4, textAlign: 'center', fontSize: 13, color: C.p7,
          fontFamily: FONTS.body, cursor: 'pointer',
          padding: '10px 0', textDecoration: 'underline',
        }}
      >
        Skip for now
      </div>
    </div>
  </div>
)

// ── HOME ─────────────────────────────────────────────────────────────
const HOLD_TO_STOP_MS = 500

// Resolve the device's primary language to a 2-letter code (e.g. 'tr', 'en').
// Used as a fallback when the user hasn't picked a translation target yet.
const DEVICE_LANG_CODE = (() => {
  if (typeof navigator === 'undefined') return 'en'
  const tag = navigator.language || (navigator.languages && navigator.languages[0]) || 'en'
  return (tag.split('-')[0] || 'en').toLowerCase()
})()

// ── Speaker panel — fixed-height card pinned between the timer and the
// language selector. The transcript content is the only scrolling region; the
// panel itself never grows, so layout stays stable as transcripts accumulate.
// Two tabs let the user flip between the translated text and the original
// language coming off the streaming server (segment.translatedText / .originalText).
const SpeakerPanel = ({ paused, partial, segments, offlineMode, recError }) => {
  const [tab, setTab] = useState('original')   // 'translated' | 'original'
  const scrollRef = useRef(null)

  // True only when at least one segment (or the partial) actually carries
  // a translation distinct from the original. When source==target the
  // streaming server typically returns null translatedText, in which case
  // the Translated tab would silently mirror Original — confusing the user
  // who taps it expecting a different view. We hide the tab in that case.
  const hasTranslation = useMemo(() => {
    const has = (s) => {
      if (!s) return false
      const t = (s.translatedText || '').trim()
      const o = (s.originalText   || '').trim()
      return t.length > 0 && t !== o
    }
    return has(partial) || (segments || []).some(has)
  }, [segments, partial])

  // If translation disappears mid-recording (e.g. user paused before any
  // arrived), make sure we don't get stuck on a now-hidden tab.
  useEffect(() => {
    if (!hasTranslation && tab === 'translated') setTab('original')
  }, [hasTranslation, tab])

  // Auto-scroll to the latest line whenever segments grow or the partial
  // updates — keeps the active speaker visible without the user pulling.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [segments?.length, partial?.originalText, partial?.translatedText, tab])

  const pickText = (s) => {
    if (!s) return ''
    if (tab === 'translated') return s.translatedText || s.originalText || ''
    return s.originalText || ''
  }

  const TabBtn = ({ id, label }) => {
    const active = tab === id
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          padding: '5px 11px', borderRadius: 8,
          border: `1.5px solid ${active ? C.p7 : C.p4}`,
          background: active ? `linear-gradient(135deg, ${C.p7}, ${C.p9})` : 'rgba(255,255,255,.6)',
          color: active ? 'white' : C.p7,
          fontFamily: FONTS.heading, fontSize: 11, fontWeight: 700, letterSpacing: .3,
          cursor: 'pointer', transition: 'background .2s ease, color .2s ease, border-color .2s ease',
          flexShrink: 0,
        }}
      >{label}</button>
    )
  }

  return (
    <div style={{
      position: 'absolute', left: 24, right: 24, top: 240, bottom: 150,
      display: 'flex', flexDirection: 'column',
      animation: 'fadeIn .4s .15s ease both',
      zIndex: 5,
    }}>
      <div style={{
        ...glassCard({ padding: '14px 18px 12px', marginBottom: 0 }),
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 0,                    // critical so the inner scroller can shrink
      }}>
        {/* Header — status row on the left, tabs on the right. Single row,
            tabs sit where the user's thumb naturally rests. */}
        <div style={{
          flexShrink: 0, marginBottom: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{
            fontSize: 11, color: C.p5, fontFamily: FONTS.body,
            display: 'flex', alignItems: 'center', gap: 5,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: offlineMode ? '#B7791F' : C.p5,
              animation: paused ? 'none' : 'pulse 1.2s ease-in-out infinite',
            }} />
            {offlineMode
              ? 'Offline'
              : (paused ? 'Paused' : (partial ? 'Speaker talking…' : 'Listening…'))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {hasTranslation && <TabBtn id="translated" label="Translated" />}
            <TabBtn id="original" label="Original" />
          </div>
        </div>

        {/* Scrollable transcript area — only this region scrolls. */}
        <div
          ref={scrollRef}
          style={{
            fontSize: 12, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.7,
            overflowY: 'auto', flex: 1, minHeight: 0,
          }}
        >
          {recError && (
            <div style={{ color: '#B32B2B', fontSize: 11, marginBottom: 8 }}>
              {recError}
            </div>
          )}
          {(!segments || segments.length === 0) && !partial && !recError && (
            <div style={{ color: C.p6, fontSize: 12, fontStyle: 'italic' }}>
              {offlineMode
                ? 'Audio is being recorded locally. Live transcripts require the streaming server.'
                : 'Speak naturally — segments will appear here as they are transcribed.'}
            </div>
          )}
          {(segments || []).map((s, i) => {
            const text = pickText(s)
            if (!text) return null
            return (
              <div key={s.id || i} style={{ marginBottom: 6 }}>
                <b style={{ color: C.p9, fontWeight: 600 }}>Speaker {1 + (s.speakerIndex || 0)}:</b>{' '}
                {text}
              </div>
            )
          })}
          {partial && (() => {
            const text = pickText(partial)
            if (!text) return null
            return (
              <div style={{ opacity: 0.65 }}>
                <b style={{ color: C.p9, fontWeight: 600 }}>Speaker {1 + (partial.speakerIndex || 0)}:</b>{' '}
                {text}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export const HomeScreen = ({
  activeTab, onNavigate, recording, paused, timer, rippling,
  partial, segments, offlineMode, recError,
  onButtonClick, onPauseToggle, onStopRecording,
}) => {
  // Read the user's selected target language from their Firestore profile so
  // the home translation pill stays in sync with what's chosen on the
  // Profile → Language screen. Falls back to the device default.
  const { profile } = useAuth()
  const targetLangCode  = profile?.defaultTargetLanguage || DEVICE_LANG_CODE
  const targetLangLabel = languageLabel(targetLangCode)

  const fmt = s =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // Bump a counter each time a ripple is requested — used to (re)mount the wave rings with fresh keys.
  const [rippleId, setRippleId] = useState(0)
  useEffect(() => { if (rippling) setRippleId(id => id + 1) }, [rippling])

  // Long-press handling for the record button.
  // - Idle:      a tap starts recording.
  // - Recording: a tap toggles pause/resume; a sustained hold (≥HOLD_TO_STOP_MS) stops recording.
  const holdTimerRef = useRef(null)
  const heldStoppedRef = useRef(false)
  const [holdActive, setHoldActive] = useState(false)
  const holdKeyRef = useRef(0)

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const onBtnPointerDown = (e) => {
    e.currentTarget.style.transform = 'scale(.93)'
    heldStoppedRef.current = false
    if (recording) {
      // Show progress ring while user holds.
      holdKeyRef.current += 1
      setHoldActive(true)
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null
        heldStoppedRef.current = true
        setHoldActive(false)
        onStopRecording?.()
      }, HOLD_TO_STOP_MS)
    }
  }

  const onBtnPointerUp = (e) => {
    e.currentTarget.style.transform = 'scale(1)'
    clearHoldTimer()
    setHoldActive(false)
    if (heldStoppedRef.current) return  // long press already fired stop
    if (recording) {
      onPauseToggle?.()
    } else {
      onButtonClick?.()
    }
  }

  const onBtnPointerCancel = (e) => {
    e.currentTarget.style.transform = 'scale(1)'
    clearHoldTimer()
    setHoldActive(false)
  }

  // Hold-progress ring geometry — circle just outside the 150-px button (140 + 5×2 border).
  const RING_R     = 80
  const RING_C     = 2 * Math.PI * RING_R

  return (
    <div style={{ position: 'relative', height: 722, overflow: 'hidden', animation: 'fadeIn .35s ease' }}>
      {/* Mic / recording error banner — shown when start failed (e.g. denied permission). */}
      {!recording && recError && (
        <div style={{
          margin: '12px 24px 0', padding: '10px 12px',
          borderRadius: 12, fontSize: 12, lineHeight: 1.45,
          fontFamily: FONTS.body,
          background: '#FFE8E8', color: '#B32B2B',
          border: '1px solid #F4C2C2',
          textAlign: 'center',
        }}>
          {recError}
        </div>
      )}

      {/* Status pill */}
      <div style={{ textAlign: 'center', paddingTop: 16 }}>
        {recording ? (
          paused ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF1D6', borderRadius: 20, padding: '5px 16px', fontSize: 12, fontWeight: 600, color: '#B7791F' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#B7791F' }} />
              Paused
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFE8E8', borderRadius: 20, padding: '5px 16px', fontSize: 12, fontWeight: 600, color: '#E53935' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E53935', animation: 'pulse 1s ease-in-out infinite' }} />
              Recording
            </div>
          )
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.p4, borderRadius: 20, padding: '5px 16px', fontSize: 12, fontWeight: 600, color: C.p7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.p7 }} />
            Ready
          </div>
        )}
      </div>

      {/* Button + Timer + Hint group — sits at screen middle when idle, slides up + shrinks more while recording */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        top: recording ? 40 : 215,
        transform: `scale(${recording ? 0.6 : 1})`,
        transformOrigin: 'top center',
        transition: 'top .55s cubic-bezier(.4,.2,.2,1), transform .55s cubic-bezier(.4,.2,.2,1)',
        zIndex: 10,
      }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', isolation: 'isolate' }}>
          {/* Soft inner aura — radial gradient */}
          <div style={{
            position: 'absolute', width: 260, height: 260, borderRadius: '50%',
            background: `radial-gradient(circle, rgba(129,99,163,.32) 0%, transparent 65%)`,
            animation: `auraPulse ${recording ? 2.2 : 3.6}s ease-in-out infinite`,
            pointerEvents: 'none',
          }} />

          {/* Halo ripples — rings emerge at button size and continuously travel outward, fading as they grow.
              Speed: idle = 7/10 of original (period 3.0 → ~4.29s); recording = 4/10 of original (period 1.8 → 4.5s).
              Paused: animation freezes so the user gets a clear visual cue. */}
          {(() => {
            const dur = recording ? 4.5 : 4.29
            const count = 4
            return Array.from({ length: count }).map((_, i) => (
              <div key={`halo-${i}`} style={{
                position: 'absolute',
                left: '50%', top: '50%',
                marginLeft: -70, marginTop: -70,
                width: 140, height: 140, borderRadius: '50%',
                border: `1.5px solid ${C.p8}`,
                animation: `haloRipple ${dur}s ${-(dur / count) * i}s ease-out infinite ${paused ? 'paused' : 'running'}`,
                pointerEvents: 'none',
              }} />
            ))
          })()}

          {/* Hold-to-stop progress ring — appears around the button while user is holding; fills in HOLD_TO_STOP_MS */}
          {holdActive && (
            <svg
              key={`hold-${holdKeyRef.current}`}
              width={RING_R * 2 + 8}
              height={RING_R * 2 + 8}
              viewBox={`0 0 ${RING_R * 2 + 8} ${RING_R * 2 + 8}`}
              style={{
                position: 'absolute',
                left: '50%', top: '50%',
                marginLeft: -(RING_R + 4), marginTop: -(RING_R + 4),
                transform: 'rotate(-90deg)',
                pointerEvents: 'none',
                zIndex: 25,
              }}
            >
              {/* Faint baseline track */}
              <circle
                cx={RING_R + 4} cy={RING_R + 4} r={RING_R}
                fill="none" stroke={C.p4} strokeWidth="3"
              />
              {/* Filling progress arc */}
              <circle
                cx={RING_R + 4} cy={RING_R + 4} r={RING_R}
                fill="none" stroke={C.p9} strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C}
                style={{
                  animation: `holdProgress ${HOLD_TO_STOP_MS}ms linear forwards`,
                }}
              />
            </svg>
          )}

          {/* Click wave — a single ring radiating outward from the button and fading away */}
          {rippleId > 0 && (
            <div key={`wave-${rippleId}`} style={{
              position: 'absolute',
              left: '50%', top: '50%',
              marginLeft: -70, marginTop: -70,
              width: 140, height: 140, borderRadius: '50%',
              border: `3px solid ${C.p8}`,
              animation: `haloWave .9s ease-out forwards`,
              pointerEvents: 'none',
              opacity: 0,
            }} />
          )}

          <button
            onPointerDown={onBtnPointerDown}
            onPointerUp={onBtnPointerUp}
            onPointerLeave={onBtnPointerCancel}
            onPointerCancel={onBtnPointerCancel}
            style={{
              position: 'relative', zIndex: 20,
              width: 140, height: 140, borderRadius: '50%',
              background: `linear-gradient(145deg, ${C.p6}, ${C.p8}, ${C.p9})`,
              border: `5px solid ${C.p6}`,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: rippling
                ? 'ripple .7s ease'
                : `btnBreathe ${recording ? 2 : 3.4}s ease-in-out infinite ${paused ? 'paused' : 'running'}`,
              transition: 'transform .12s',
              touchAction: 'manipulation',
            }}
          >
            <Logo size={80} />
          </button>
        </div>
      </div>

      {/* Timer — under button */}
      <div style={{ textAlign: 'center', marginTop: 36 }}>
        <span style={{ fontFamily: FONTS.heading, fontSize: 48, fontWeight: 700, color: C.p9, letterSpacing: 3, lineHeight: 1 }}>
          {fmt(timer)}
        </span>
      </div>

      {/* Hint */}
      <p style={{ textAlign: 'center', fontSize: 13, color: C.p6, margin: '8px 0 0', fontFamily: FONTS.body }}>
        {recording
          ? (paused ? 'Tap to resume · Hold to stop' : 'Tap to pause · Hold to stop')
          : 'Tap to start recording'}
      </p>
      </div>

      {/* Speaker panel — recording only, fills the space between the timer/hint group and the language select */}
      {recording && (
        <SpeakerPanel
          paused={paused}
          partial={partial}
          segments={segments}
          offlineMode={offlineMode}
          recError={recError}
        />
      )}

      {/* Language select — fixed above nav. Tapping navigates to the same
          LangSelect screen the Profile menu opens, so the source of truth
          for the target language stays consistent across screens. */}
      <div style={{ position: 'absolute', bottom: 87, left: 24, right: 24 }}>
        <div
          onClick={() => onNavigate?.('langSelect')}
          style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0, padding: '6px 14px' }) }}
        >
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(129,99,163,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4" fill={C.p7} />
              <path d="M2 12S5 5 12 5s10 7 10 7-3 7-10 7S2 12 2 12Z" stroke={C.p7} strokeWidth="1.8" />
            </svg>
          </div>
          <div style={{ fontFamily: FONTS.body, flex: 1, lineHeight: 1.25 }}>
            <div style={{ fontSize: 9, color: C.p6, letterSpacing: 0.3, textTransform: 'uppercase' }}>Translation</div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: C.p9 }}>Detect language → {targetLangLabel}</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke={C.p6} strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <BottomNav active={activeTab} onNavigate={onNavigate} />
    </div>
  )
}

// ── MEETING SUMMARY ──────────────────────────────────────────────────
// AI-generated headlines surfaced as a single, scannable list of takeaways.
const SUMMARY_HEADLINES = [
  'Q4 strategy adjusted based on Q3 market feedback',
  'Technical architecture upgrades and UX optimization planned',
  'AI processing engine flagged for scalability re-evaluation',
  'Multimodal fusion identified as priority challenge',
  'Real-time transcription targeted for 15% accuracy gain',
  'New UI design language approved with fresh visual approach',
  'Product roadmap finalized through end of next year',
  'Marketing rollout plan scheduled for next phase',
]

// Topic-tree palette — distinct hue per top-level branch.
const TREE_PALETTE = ['#10B981', '#EF4444', '#F59E0B', '#06B6D4', '#8B5CF6', '#F97316', '#EAB308', '#A855F7']

// Topic tree data — meeting summary as a branching mind map (topic-organized, not chronological).
const TREE_DATA = [
  { id: 't',    label: 'Topic',       text: 'Q4 Product Strategy' },
  { id: 'd',    label: 'Date',        text: 'Oct 24, 2024' },
  { id: 'a',    label: 'Attendees',   children: [
    { text: 'Speaker 1 — Alex' },
    { text: 'Speaker 2 — Jordan' },
    { text: 'Speaker 3 — Sam' },
  ] },
  { id: 'k',    label: 'Key Topics',  children: [
    { text: 'Q3 progress and feedback' },
    { text: 'AI iteration challenges' },
    { text: 'Multimodal fusion priority' },
    { text: 'Transcription +15% accuracy' },
    { text: 'New UI design language' },
  ] },
  { id: 'disc', label: 'Discussion',  children: [
    { bold: 'Strategy',      text: 'Adjusted Q4 plan from feedback' },
    { bold: 'Engine',        text: 'AI scalability review needed' },
    { bold: 'Multimodal',    text: 'Priority challenge identified', highlight: true },
    { bold: 'Transcription', text: '+15% accuracy target set' },
    { bold: 'Design',        text: 'Fresh visual UI approach' },
  ] },
  { id: 'dec',  label: 'Decisions',   text: 'Roadmap finalized' },
  { id: 'n',    label: 'Next Steps',  text: 'Marketing rollout scheduled' },
]

// Layout constants for the tree (natural pixel sizes — scaled later for display).
const T_NODE_H    = 26
const T_SUB_H     = 22
const T_ROOT_X    = 60
const T_MAIN_X    = 180
const T_SUB_X     = 320
const T_PAD_Y     = 16
const T_GAP_Y     = 10
const T_SUB_GAP   = 4
const T_VIEW_W    = 620

// Compute branch positions for any tree data array (each entry: { id?, label,
// text? | items? | children? }). Returns { branches, totalH } where each
// branch carries its top/center/height + assigned palette color.
const computeTreeLayout = (data) => {
  const branches = (Array.isArray(data) ? data : []).map((c, i) => ({
    ...c,
    color: TREE_PALETTE[i % TREE_PALETTE.length],
    // Accept either Flutter-style `children` or summary-style `items`.
    sub: c.items || c.children || [],
  }))
  let cursor = T_PAD_Y
  branches.forEach(b => {
    const sc = b.sub.length
    const h = sc > 0 ? sc * (T_SUB_H + T_SUB_GAP) - T_SUB_GAP : T_NODE_H
    b.top = cursor
    b.center = cursor + h / 2
    b.height = h
    cursor += h + T_GAP_Y
  })
  return { branches, totalH: cursor + T_PAD_Y }
}

// Default static layout used as a fallback when no session summary is loaded.
const TREE_LAYOUT = computeTreeLayout(TREE_DATA)

// How long the user has to keep their finger still before a swipe is interpreted as
// "swap inner panel" (instead of bubbling up to the tab-swipe handler).
const PANEL_HOLD_MS = 250

const AISummaryPanel = ({ headlines }) => {
  const list = (headlines && headlines.length > 0) ? headlines : SUMMARY_HEADLINES
  return (
    <div style={{ ...glassCard({ padding: '14px 18px', marginBottom: 0 }) }}>
      {list.map((line, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.p4}, ${C.p5})`,
            color: C.p9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, fontFamily: FONTS.heading,
            flexShrink: 0,
          }}>{i + 1}</div>
          <span style={{ fontSize: 13, color: C.p9, lineHeight: 1.55, fontFamily: FONTS.body }}>
            {line}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Topic Tree View — branching mind-map style summary with pinch-zoom + pan ──
const TopicTreeCanvas = ({ layout = TREE_LAYOUT }) => (
  <div style={{ position: 'relative', width: T_VIEW_W, height: layout.totalH }}>
    <svg width={T_VIEW_W} height={layout.totalH} style={{ position: 'absolute', inset: 0 }}>
      {/* Curves: root → main branch */}
      {layout.branches.map(b => {
        const rootX = T_ROOT_X + 60
        const rootY = layout.totalH / 2
        const mid = (rootX + T_MAIN_X) / 2
        return (
          <path key={`m-${b.id || b.label}`}
            d={`M ${rootX} ${rootY} C ${mid} ${rootY}, ${mid} ${b.center}, ${T_MAIN_X - 4} ${b.center}`}
            stroke={b.color} strokeWidth="2.5" fill="none" strokeLinecap="round"
          />
        )
      })}
      {/* Curves: main branch → sub-items */}
      {layout.branches.map(b =>
        b.sub.map((sub, j) => {
          const subY = b.top + j * (T_SUB_H + T_SUB_GAP) + T_SUB_H / 2
          const startX = T_MAIN_X + 95
          const mid = (startX + T_SUB_X) / 2
          return (
            <path key={`s-${b.id || b.label}-${j}`}
              d={`M ${startX} ${b.center} C ${mid} ${b.center}, ${mid} ${subY}, ${T_SUB_X - 4} ${subY}`}
              stroke={b.color} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.75"
            />
          )
        })
      )}
    </svg>

    {/* Root label */}
    <div style={{
      position: 'absolute',
      left: T_ROOT_X - 50, top: layout.totalH / 2 - 24,
      width: 110, padding: '8px 10px',
      background: `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
      color: 'white', borderRadius: 14, textAlign: 'center',
      fontFamily: FONTS.heading, fontSize: 12, fontWeight: 700, lineHeight: 1.2,
      boxShadow: `0 4px 12px rgba(74,32,112,.3)`,
    }}>
      Meeting<br/>Summary
    </div>

    {/* Main branch labels */}
    {layout.branches.map(b => (
      <div key={`mb-${b.id || b.label}`} style={{
        position: 'absolute',
        left: T_MAIN_X, top: b.center - 12,
        fontFamily: FONTS.heading, fontSize: 12, fontWeight: 600, color: C.p9,
        whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: b.color }} />
        {b.label}
      </div>
    ))}

    {/* Direct text for branches without sub-children */}
    {layout.branches.filter(b => (!b.sub || b.sub.length === 0) && b.text).map(b => (
      <div key={`bt-${b.id || b.label}`} style={{
        position: 'absolute',
        left: T_MAIN_X + 100, top: b.center - 8,
        fontSize: 11, color: C.p6, fontFamily: FONTS.body, whiteSpace: 'nowrap',
      }}>
        {b.text}
      </div>
    ))}

    {/* Sub-item labels */}
    {layout.branches.map(b =>
      b.sub.map((sub, j) => {
        const subY = b.top + j * (T_SUB_H + T_SUB_GAP) + T_SUB_H / 2
        return (
          <div key={`st-${b.id || b.label}-${j}`} style={{
            position: 'absolute',
            left: T_SUB_X, top: subY - 10,
            fontSize: 11, color: sub.highlight ? '#fff' : C.p9,
            fontFamily: FONTS.body, whiteSpace: 'nowrap',
            background: sub.highlight ? b.color : 'transparent',
            padding: sub.highlight ? '3px 8px' : 0,
            borderRadius: 4,
          }}>
            {sub.bold && (
              <span style={{ fontWeight: 700, color: sub.highlight ? '#fff' : b.color, marginRight: 4 }}>
                {sub.bold}:
              </span>
            )}
            {sub.text}
          </div>
        )
      })
    )}
  </div>
)

// Interactive tree wrapper — handles pinch-zoom, pan, and stops outer panel-swipe gesture
// while two fingers (pinch) or pan-while-zoomed-in is happening.
const TopicTreeViewport = ({ initialZoom = 0.55, fullscreen = false, layout = TREE_LAYOUT }) => {
  const [zoom, setZoom]   = useState(initialZoom)
  const [pan, setPan]     = useState({ x: 0, y: 0 })
  const pointersRef       = useRef(new Map())
  const pinchRef          = useRef(null)
  const panStartRef       = useRef(null)

  const onTreePointerDown = (e) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      }
      e.stopPropagation()
    } else if (pointersRef.current.size === 1) {
      // Single-finger pan is always available inside the tree, regardless of zoom.
      panStartRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false }
    }
  }

  const onTreePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const ratio = distance / pinchRef.current.distance
      const newZoom = Math.max(0.4, Math.min(3, pinchRef.current.zoom * ratio))
      setZoom(newZoom)
      e.stopPropagation()
    } else if (pointersRef.current.size === 1 && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.startX
      const dy = e.clientY - panStartRef.current.startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panStartRef.current.moved = true
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      })
      // Stop propagation only once the user has actually started panning so taps still pass through.
      if (panStartRef.current.moved) e.stopPropagation()
    }
  }

  const onTreePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) panStartRef.current = null
  }

  return (
    <div
      onPointerDown={onTreePointerDown}
      onPointerMove={onTreePointerMove}
      onPointerUp={onTreePointerUp}
      onPointerCancel={onTreePointerUp}
      style={{
        position: 'relative', overflow: 'hidden', flex: 1,
        touchAction: 'none', cursor: 'grab',
      }}
    >
      <div style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        width: T_VIEW_W, height: layout.totalH,
      }}>
        <TopicTreeCanvas layout={layout} />
      </div>

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        display: 'flex', flexDirection: 'column', gap: 4,
        background: 'rgba(255,255,255,.8)',
        borderRadius: 10, padding: 4,
        border: `1px solid ${C.p4}`,
      }}>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(3, +(z + 0.2).toFixed(2))) }}
          style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', color: C.p9, fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0 }}
          aria-label="Zoom in"
        >+</button>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(2))); setPan({ x: 0, y: 0 }) }}
          style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', color: C.p9, fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0 }}
          aria-label="Zoom out"
        >−</button>
      </div>
    </div>
  )
}

// Tree panel — chromeless container with a floating fullscreen button. Tree fills the
// available space; user can pinch/zoom and pan to explore.
const TopicTreePanel = ({ onFullscreen, layout = TREE_LAYOUT }) => (
  <div style={{
    ...glassCard({ padding: 0, marginBottom: 0, overflow: 'hidden' }),
    position: 'relative', display: 'flex', flexDirection: 'column', height: '100%',
  }}>
    <TopicTreeViewport initialZoom={0.7} layout={layout} />
    <button
      onClick={(e) => { e.stopPropagation(); onFullscreen() }}
      aria-label="Fullscreen"
      style={{
        position: 'absolute', top: 10, right: 10, zIndex: 5,
        width: 32, height: 32, borderRadius: 10,
        background: 'rgba(255,255,255,.85)',
        border: `1px solid ${C.p4}`,
        cursor: 'pointer', color: C.p7,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
        boxShadow: `0 2px 8px rgba(74,32,112,.12)`,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  </div>
)

export const SummaryScreen = ({
  activeTab, onNavigate, sessionId, hasContent, onGenerate, onMindMap, onEdit, onBack, onPickRecording,
}) => {
  const [panelIndex, setPanelIndex]       = useState(0)  // 0 = AI Summary, 1 = Topic Tree
  const [holdActive, setHoldActive]       = useState(false)
  const [dragOffset, setDragOffset]       = useState(0)
  const [treeFullscreen, setTreeFullscreen] = useState(false)
  const gestureRef    = useRef(null)
  const containerRef  = useRef(null)

  // Real summary: load the session's cached summary (if any), and let the
  // user generate or regenerate via the aiChat-backed service.
  const [session, setSession]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)

  useEffect(() => {
    if (!sessionId) { setSession(null); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const s = await getSession(sessionId)
        if (!cancelled) setSession(s)
      } catch (e) {
        if (!cancelled) console.error('[SummaryScreen] load session failed', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const realSummary  = session?.summary || null
  const realHeadlines = realSummary?.headlines && realSummary.headlines.length > 0
    ? realSummary.headlines
    : null
  const realTree     = realSummary?.tree && realSummary.tree.length > 0
    ? realSummary.tree
    : null
  const treeLayout   = useMemo(
    () => realTree ? computeTreeLayout(realTree) : TREE_LAYOUT,
    [realTree],
  )

  const handleGenerate = async () => {
    if (!sessionId) { onGenerate?.(); return }  // no session → fall back to old mock toggle
    if (generating) return
    setGenerating(true)
    setGenError(null)
    try {
      await generateSummaryFor(sessionId)
      // Reload session so we get the cached summary + timestamp.
      const s = await getSession(sessionId)
      setSession(s)
      onGenerate?.()
    } catch (e) {
      console.error('[SummaryScreen] generateSummary failed', e)
      setGenError(e?.message || 'Could not generate a summary. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const onPanelPointerDown = (e) => {
    gestureRef.current = {
      startX: e.clientX, startY: e.clientY,
      hasMoved: false, isHold: false, timer: null,
    }
    gestureRef.current.timer = setTimeout(() => {
      const g = gestureRef.current
      if (g && !g.hasMoved) {
        g.isHold = true
        setHoldActive(true)
      }
    }, PANEL_HOLD_MS)
  }

  const onPanelPointerMove = (e) => {
    const g = gestureRef.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.isHold) {
      // If user moves before the hold delay, this isn't a panel-swipe — let the
      // tab-swipe in PhoneFrame handle it instead. Cancel our timer and bail.
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        clearTimeout(g.timer)
        g.hasMoved = true
        gestureRef.current = null
      }
      return
    }
    // Hold mode: live-track horizontal drag for panel preview, clamped to one width.
    const w = containerRef.current?.offsetWidth || 327
    setDragOffset(Math.max(-w, Math.min(w, dx)))
  }

  const onPanelPointerUp = (e) => {
    const g = gestureRef.current
    if (!g) {
      setDragOffset(0)
      setHoldActive(false)
      return
    }
    clearTimeout(g.timer)
    if (g.isHold) {
      const dx = e.clientX - g.startX
      if (Math.abs(dx) > 60) {
        if (dx < 0 && panelIndex < 1) setPanelIndex(1)
        else if (dx > 0 && panelIndex > 0) setPanelIndex(0)
      }
      setDragOffset(0)
      setHoldActive(false)
      // Prevent the tab-swipe handler in PhoneFrame from also reacting to this gesture.
      e.stopPropagation()
    }
    gestureRef.current = null
  }

  return (
    <div style={{ position: 'relative', minHeight: 700, animation: 'fadeIn .35s ease' }}>
      {onBack ? (
        <Header title="Meeting Summary" onBack={onBack} />
      ) : (
        <div style={{ padding: '4px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 700, color: C.p9 }}>Meeting Summary</span>
        </div>
      )}
      <div style={{ padding: '12px 24px 0' }}>
        <div style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', marginBottom: 0 }) }}>
          <input placeholder="Search meeting records..." style={{ background: 'none', border: 'none', outline: 'none', flex: 1, fontSize: 14, color: C.p9, fontFamily: FONTS.body }} />
        </div>
      </div>

      {(sessionId ? !!realSummary : hasContent) ? (
        <>
          {/* Tab buttons — primary panel switcher; hold-swipe still works as a shortcut. */}
          <div style={{ padding: '12px 24px 8px', display: 'flex', gap: 8 }}>
            {[
              { i: 0, label: 'AI Summary' },
              { i: 1, label: 'Topic Tree' },
            ].map(t => {
              const active = panelIndex === t.i
              return (
                <button
                  key={t.i}
                  onClick={() => setPanelIndex(t.i)}
                  style={{
                    flex: 1, padding: '10px 14px',
                    borderRadius: 12,
                    border: active ? `1.5px solid ${C.p9}` : `1.5px solid ${C.p4}`,
                    background: active
                      ? `linear-gradient(135deg, ${C.p7}, ${C.p9})`
                      : 'rgba(255,255,255,.7)',
                    color: active ? 'white' : C.p7,
                    fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background .25s ease, color .25s ease, border-color .25s ease',
                    boxShadow: active ? `0 4px 14px rgba(74,32,112,.25)` : 'none',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          <div
            ref={containerRef}
            onPointerDown={onPanelPointerDown}
            onPointerMove={onPanelPointerMove}
            onPointerUp={onPanelPointerUp}
            onPointerCancel={onPanelPointerUp}
            style={{
              position: 'relative',
              overflow: 'hidden',
              height: 440,
              touchAction: 'pan-y',
              cursor: holdActive ? 'grabbing' : 'auto',
            }}
          >
            <div style={{
              display: 'flex',
              width: '200%', height: '100%',
              transform: holdActive
                ? `translate3d(calc(${-panelIndex * 50}% + ${dragOffset}px), 0, 0)`
                : `translate3d(${-panelIndex * 50}%, 0, 0)`,
              transition: holdActive ? 'none' : 'transform .35s cubic-bezier(.4,.2,.2,1)',
            }}>
              <div style={{ width: '50%', flexShrink: 0, padding: '4px 24px 12px', boxSizing: 'border-box', overflowY: 'auto' }}>
                <AISummaryPanel headlines={realHeadlines} />
              </div>
              <div style={{ width: '50%', flexShrink: 0, padding: '4px 24px 12px', boxSizing: 'border-box' }}>
                <TopicTreePanel layout={treeLayout} onFullscreen={() => setTreeFullscreen(true)} />
              </div>
            </div>
          </div>

          <div style={{ padding: '4px 24px 12px' }}>
            <button onClick={onMindMap} style={gradientButton({ marginBottom: 8 })}>Generate Mind Map</button>
            {sessionId && realSummary && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={gradientButton({
                  background: 'transparent', color: C.p7, border: `1.5px solid ${C.p5}`,
                  marginBottom: 8,
                  opacity: generating ? 0.65 : 1, cursor: generating ? 'wait' : 'pointer',
                })}
              >
                {generating ? 'Regenerating…' : 'Regenerate Summary'}
              </button>
            )}
            <button onClick={onEdit} style={gradientButton({ background: 'transparent', color: C.p7, border: `1.5px solid ${C.p5}` })}>Edit Summary</button>
          </div>
        </>
      ) : (
        <div style={{ padding: '0 24px', textAlign: 'center', paddingTop: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, animation: 'pulse 2s ease-in-out infinite' }}>
            <Icon name="sparkle" size={44} color={C.p7} strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.p9, fontFamily: FONTS.heading, marginBottom: 6 }}>
            {sessionId ? 'No summary for this recording yet' : 'No recording selected'}
          </div>
          <div style={{ fontSize: 13, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.7, marginBottom: 24 }}>
            {sessionId
              ? <>Tap below — AI will read the transcript and<br />produce key takeaways + a topic tree.</>
              : <>Pick a recording from the Records tab,<br />then come back here to generate its summary.</>}
          </div>
          {sessionId && (
            <div style={{ ...glassCard({ textAlign: 'left', padding: '12px 16px', marginBottom: 20 }) }}>
              <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginBottom: 2 }}>
                {loading ? 'Loading…' : (session?.title || 'Untitled recording')}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.p9, fontFamily: FONTS.body }}>
                {session ? formatSessionDate(session.createdAt) : ''}
              </div>
            </div>
          )}
          {genError && (
            <div style={{
              padding: '10px 12px', borderRadius: 10, marginBottom: 14,
              fontSize: 12, lineHeight: 1.4, fontFamily: FONTS.body,
              background: '#FFE8E8', color: '#B32B2B', border: '1px solid #F4C2C2',
            }}>
              {genError}
            </div>
          )}
          {sessionId ? (
            <button
              onClick={handleGenerate}
              disabled={generating || loading}
              style={gradientButton({
                width: 'auto', padding: '12px 32px',
                opacity: (generating || loading) ? 0.65 : 1, cursor: (generating || loading) ? 'wait' : 'pointer',
              })}
            >
              {generating ? 'Generating…' : 'Generate Summary'}
            </button>
          ) : (
            <button
              onClick={onPickRecording}
              style={gradientButton({ width: 'auto', padding: '12px 32px' })}
            >
              Browse Recordings
            </button>
          )}
        </div>
      )}
      {!onBack && <BottomNav active={activeTab} onNavigate={onNavigate} />}

      {/* Fullscreen Topic Tree overlay */}
      {treeFullscreen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: `linear-gradient(180deg, ${C.bg} 0%, ${C.p4} 100%)`,
          display: 'flex', flexDirection: 'column',
          animation: 'fadeIn .25s ease',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 18px',
            borderBottom: `1px solid ${C.p4}`,
            background: 'rgba(255,255,255,.6)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 700, color: C.p9 }}>Topic Tree</div>
              <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginTop: 1 }}>Pinch or use ± to zoom · drag to pan</div>
            </div>
            <button
              onClick={() => setTreeFullscreen(false)}
              aria-label="Close"
              style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'rgba(255,255,255,.85)',
                border: `1px solid ${C.p4}`,
                cursor: 'pointer', color: C.p9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <TopicTreeViewport initialZoom={1} fullscreen layout={treeLayout} />
        </div>
      )}
    </div>
  )
}

// ── SUMMARY EDIT ─────────────────────────────────────────────────────
export const SummaryEditScreen = ({ onBack }) => (
  <div style={{ animation: 'fadeIn .35s ease' }}>
    <Header title="Edit" onBack={onBack} />
    <div style={{ padding: '0 24px', maxHeight: 680, overflowY: 'auto' }}>
      {[
        { s: '[Overview]',   t: 'This Q3 2025 progress meeting addressed shifts in next-step strategy driven by market feedback.' },
        { s: '[Background]', t: 'With the rapid iteration of AI, EchoMind AI faces new challenges in processing efficiency and multimodal fusion.' },
        { s: '[Discussion]', t: '• Discussed real-time recording transcription/captioning improvements\n• Settled on a refined UI design language' },
        { s: '[Outcomes]',   t: 'This meeting clarified the product roadmap from year-end through next year.' },
      ].map((x, i) => (
        <div key={i} style={{ ...glassCard({ marginBottom: 14 }) }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.p9, fontFamily: FONTS.heading, marginBottom: 8 }}>{x.s}</div>
          <textarea defaultValue={x.t} style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontSize: 13, color: C.p6, lineHeight: 1.7, fontFamily: FONTS.body, resize: 'none', minHeight: 70 }} />
        </div>
      ))}
      <button onClick={onBack} style={gradientButton({ marginBottom: 24 })}>Save</button>
    </div>
  </div>
)

// ── MIND MAP ─────────────────────────────────────────────────────────
// Mind map shows exactly 4 fixed top-level branches. Whatever categories the
// AI summary returns are bucketed into one of these so the layout stays
// stable and on-screen. Tap a branch → its sub-items open below as a panel.
const MIND_MAIN_BRANCHES = [
  {
    id: 'topic',
    label: 'Topic',
    iconName: 'clipboard',
    // Source-summary node labels that map into this bucket.
    matches: ['Topic', 'Date', 'Attendees', 'Background', 'Overview'],
  },
  {
    id: 'discussion',
    label: 'Discussion',
    iconName: 'discussion',
    matches: ['Discussion', 'Key Topics', 'Topics'],
  },
  {
    id: 'decisions',
    label: 'Decisions',
    iconName: 'target',
    matches: ['Decisions', 'Decision', 'Action Items'],
  },
  {
    id: 'outline',
    label: 'Outline',
    iconName: 'map',
    matches: ['Outline', 'Outcomes', 'Next Steps', 'Roadmap'],
  },
]

// Bucketize summary.tree nodes into the 4 main branches above. Each child
// becomes an { speaker, topic } row matching the existing detail-panel UI.
const bucketizeSummaryTree = (summaryTree) => {
  const safe = Array.isArray(summaryTree) ? summaryTree : []
  return MIND_MAIN_BRANCHES.map(main => {
    const items = []
    safe
      .filter(n => n && main.matches.includes(n.label))
      .forEach(n => {
        if (typeof n.text === 'string' && n.text.trim()) {
          items.push({ speaker: n.label, topic: n.text.trim() })
        }
        if (Array.isArray(n.items)) {
          n.items.forEach(it => {
            const topic = (it.text || it.bold || '').toString().trim()
            if (!topic) return
            items.push({
              speaker: it.speaker || it.bold || n.label,
              topic,
              highlight: !!it.highlight,
            })
          })
        }
      })
    return { ...main, items }
  })
}

// Static fallback for when there's no real summary yet — keeps the page
// looking "alive" before the user has generated anything.
const MIND_BRANCHES_FALLBACK = [
  { ...MIND_MAIN_BRANCHES[0], items: [
    { speaker: 'Topic',     topic: 'Q4 Product Strategy Sync' },
    { speaker: 'Date',      topic: 'Oct 24, 2024' },
    { speaker: 'Attendees', topic: '3 speakers' },
  ] },
  { ...MIND_MAIN_BRANCHES[1], items: [
    { speaker: 'Strategy',      topic: 'Q4 plan adjustment' },
    { speaker: 'Engine',        topic: 'Scalability review' },
    { speaker: 'Design',        topic: 'New UI direction' },
  ] },
  { ...MIND_MAIN_BRANCHES[2], items: [
    { speaker: 'Roadmap',  topic: 'Finalized through next year' },
  ] },
  { ...MIND_MAIN_BRANCHES[3], items: [
    { speaker: 'Marketing', topic: 'Rollout scheduled for next phase' },
  ] },
]

const MindBranchNode = ({ branch, state, onClick }) => {
  // state: 'normal' | 'active' | 'dim'
  const isActive = state === 'active'
  const isDim   = state === 'dim'
  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        padding: isDim ? '8px 4px' : '11px 6px',
        borderRadius: 13,
        background: isActive
          ? `linear-gradient(135deg, ${C.p7}, ${C.p9})`
          : 'rgba(255,255,255,0.78)',
        border: `1.5px solid ${isActive ? C.p9 : C.p4}`,
        color: isActive ? 'white' : C.p9,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'transform .35s ease, opacity .35s ease, padding .35s ease, font-size .35s ease, background .25s ease',
        transform: isDim ? 'scale(.88)' : 'scale(1)',
        opacity: isDim ? 0.55 : 1,
        boxShadow: isActive ? `0 8px 22px rgba(74,32,112,.35)` : 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
        <Icon
          name={branch.iconName}
          size={isDim ? 16 : 20}
          color={isActive ? '#fff' : C.p7}
          strokeWidth={1.7}
        />
      </div>
      <div style={{
        fontFamily: FONTS.body,
        fontSize: isDim ? 10 : 11.5,
        fontWeight: isActive ? 700 : 500,
        letterSpacing: 0.1,
      }}>
        {branch.label}
      </div>
    </div>
  )
}

export const MindMapScreen = ({ sessionId, onBack, selectedBranch, setSelectedBranch, onOpenTopic }) => {
  const [session, setSession] = useState(null)
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    getSession(sessionId)
      .then(s => { if (!cancelled) setSession(s) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [sessionId])

  // Always render exactly the 4 main branches. AI-generated nodes get
  // bucketized; fall back to the placeholder set when no summary exists.
  const summaryTree = session?.summary?.tree
  const branches = useMemo(() => {
    if (Array.isArray(summaryTree) && summaryTree.length > 0) {
      return bucketizeSummaryTree(summaryTree)
    }
    return MIND_BRANCHES_FALLBACK
  }, [summaryTree])

  const selected = branches.find(b => b.id === selectedBranch)

  return (
    <div style={{ animation: 'fadeIn .35s ease', display: 'flex', flexDirection: 'column', height: 722 }}>
      <Header title="Mind Map" onBack={onBack} right={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 15V3M12 15L8 11M12 15L16 11" stroke={C.p9} strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={C.p9} strokeWidth="2" strokeLinecap="round" />
        </svg>
      } />

      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '4px 0 28px' }}>
        {/* Tree visualization — top-down branching */}
        <div style={{ padding: '8px 22px 8px' }}>
          {/* Main topic node */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              padding: '14px 20px',
              borderRadius: 18,
              background: `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
              color: 'white',
              fontFamily: FONTS.heading,
              textAlign: 'center',
              boxShadow: `0 10px 26px rgba(74,32,112,.32)`,
              maxWidth: 240,
            }}>
              <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase' }}>
                Meeting Summary
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>
                Q4 Product Strategy
              </div>
            </div>
          </div>

          {/* Vertical trunk down to the horizontal trunk */}
          <div style={{ width: 2, height: 28, background: C.p5, margin: '0 auto', borderRadius: 1 }} />
          {/* Horizontal trunk spanning the four branches */}
          <div style={{ height: 2, background: C.p5, margin: '0 12.5%', borderRadius: 1 }} />

          {/* 4 branch nodes */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            {branches.map(b => {
              const state = !selectedBranch ? 'normal' : (b.id === selectedBranch ? 'active' : 'dim')
              return (
                <div key={b.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Stem from horizontal trunk to node */}
                  <div style={{ width: 2, height: 14, background: C.p5, borderRadius: 1 }} />
                  <MindBranchNode
                    branch={b}
                    state={state}
                    onClick={() => setSelectedBranch(state === 'active' ? null : b.id)}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel — speakers and topics for the active branch */}
        {selected && (
          <div style={{
            margin: '14px 22px 0',
            padding: '16px 18px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.85)',
            border: `1.5px solid ${C.p5}`,
            animation: 'slideUp .35s ease',
            boxShadow: `0 10px 28px rgba(74,32,112,.18)`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 12, paddingBottom: 12,
              borderBottom: `1px solid ${C.p4}`,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name={selected.iconName} size={20} color="#fff" strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 700, color: C.p9 }}>
                  {selected.label}
                </div>
                <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginTop: 2 }}>
                  {selected.items.length === 0
                    ? 'No items in this branch yet'
                    : `${selected.items.length} ${selected.items.length === 1 ? 'item' : 'items'}`}
                </div>
              </div>
              <button
                onClick={() => setSelectedBranch(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.p7 }}
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {selected.items.length === 0 && (
              <div style={{
                padding: '14px 12px', textAlign: 'center',
                fontSize: 12, color: C.p6, fontFamily: FONTS.body,
                background: 'rgba(216,200,233,.30)', borderRadius: 12,
                border: `1px dashed ${C.p4}`,
              }}>
                The AI didn't surface anything for this branch.
                Try regenerating the summary or add a longer recording.
              </div>
            )}

            {selected.items.map((item, i) => {
              // Prefer a numeric speaker ID (e.g. "Speaker 2" → "2"); fall
              // back to the first letter for non-numeric labels like "Engine".
              const numeric = (item.speaker || '').match(/\d+/)?.[0]
              const badge   = numeric || (item.speaker || '·').trim().charAt(0).toUpperCase() || '·'
              return (
                <div
                  key={i}
                  onClick={() => onOpenTopic?.(selected.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 12px', marginBottom: 7,
                    borderRadius: 12,
                    background: item.highlight ? `${C.p7}22` : 'rgba(216,200,233,.40)',
                    border: `1px solid ${item.highlight ? C.p7 : C.p4}`,
                    cursor: 'pointer',
                    transition: 'background .2s, transform .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(189,162,218,.55)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = item.highlight ? `${C.p7}22` : 'rgba(216,200,233,.40)' }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.p6}, ${C.p8})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    fontFamily: FONTS.heading, fontWeight: 700, color: 'white', fontSize: 12,
                  }}>
                    {badge}
                  </div>
                  <div style={{ flex: 1, fontFamily: FONTS.body, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.p7, fontWeight: 600, letterSpacing: 0.2 }}>
                      {item.speaker}
                    </div>
                    <div style={{ fontSize: 13, color: C.p9, fontWeight: 500, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.topic}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M9 6l6 6-6 6" stroke={C.p7} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              )
            })}

            <div style={{ fontSize: 11, color: C.p6, textAlign: 'center', marginTop: 8, fontFamily: FONTS.body }}>
              Tap a topic to open it in Summary
            </div>
          </div>
        )}

        {/* Hint when no branch is selected */}
        {!selected && (
          <div style={{
            margin: '24px 22px 0',
            padding: '14px 18px',
            borderRadius: 14,
            background: 'rgba(255,255,255,.55)',
            border: `1.5px dashed ${C.p4}`,
            textAlign: 'center',
            fontFamily: FONTS.body,
            fontSize: 12,
            color: C.p7,
          }}>
            Tap a branch above to explore its speakers and topics.
          </div>
        )}
      </div>
    </div>
  )
}

// ── PAYMENT ──────────────────────────────────────────────────────────
export const PaymentScreen = ({ onBack }) => (
  <div style={{ animation: 'fadeIn .35s ease' }}>
    <Header title="" onBack={onBack} />
    <div style={{ padding: '0 28px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 13, color: C.p6, fontFamily: FONTS.body, marginBottom: 2 }}>Amount Due</div>
        <div style={{ fontFamily: FONTS.heading, fontSize: 40, fontWeight: 700, color: C.p9 }}>$5,560</div>
      </div>
      <div style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }) }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="13" rx="2" stroke="white" strokeWidth="1.8" />
            <path d="M3 10h18" stroke="white" strokeWidth="1.8" />
          </svg>
        </div>
        <div style={{ fontFamily: FONTS.body }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.p9 }}>Q4 Product Strategy Sync</div>
          <div style={{ fontSize: 11, color: C.p6 }}>October 24, 2023 · 45:12</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.p9, fontFamily: FONTS.body, marginBottom: 10 }}>Payment Method</div>
      {[{ n: 'Apple Pay', s: 'Face ID, credit/debit cards', sel: true }, { n: 'Credit Card', s: 'One-tap purchase, secure checkout', sel: false }].map((m, i) => (
        <div key={i} style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${m.sel ? C.p7 : C.p4}`, cursor: 'pointer' }) }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: i === 0 ? '#000' : `linear-gradient(135deg, ${C.p5}, ${C.p7})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {i === 0
              ? <svg width="18" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.39.07 2.35.77 3.18.8 1.22-.23 2.38-.94 3.68-.84 1.57.13 2.75.76 3.5 1.9-3.22 1.88-2.75 6.05.47 7.4-.68 1.6-1.33 3.04-2.83 3.62zM12.03 7.36c-.14-2.4 1.93-4.37 4.22-4.57.35 2.71-2.47 4.76-4.22 4.57z" /></svg>
              : <svg width="18" height="14" viewBox="0 0 24 18" fill="none"><rect x="1" y="1" width="22" height="16" rx="3" stroke="white" strokeWidth="1.8" /><path d="M1 6h22" stroke="white" strokeWidth="1.8" /></svg>
            }
          </div>
          <div style={{ flex: 1, fontFamily: FONTS.body }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.p9 }}>{m.n}</div>
            <div style={{ fontSize: 11, color: C.p6 }}>{m.s}</div>
          </div>
          {m.sel && (
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.p7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: `1px solid ${C.p4}`, margin: '6px 0 16px' }}>
        <span style={{ fontSize: 14, color: C.p6, fontFamily: FONTS.body }}>Total</span>
        <span style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700, color: C.p9 }}>$5,560</span>
      </div>
      <button onClick={onBack} style={gradientButton()}>Pay</button>
    </div>
  </div>
)

// ── MEETING RECORDS ──────────────────────────────────────────────────
// Live-streams /sessions filtered by the current user (mirrors
// allUserSessionsProvider in lib/providers/session_provider.dart). Empty
// state when the user has no recordings yet.
const formatSessionDate = (date) => {
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const formatDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

export const RecordsScreen = ({ activeTab, onNavigate, onDetail }) => {
  const { sessions, loading, error } = useSessions()

  return (
    <div style={{ position: 'relative', minHeight: 700, animation: 'fadeIn .35s ease' }}>
      <div style={{ padding: '4px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 700, color: C.p9 }}>Meeting Records</span>
        {sessions.length > 0 && (
          <span style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body }}>
            {sessions.length} {sessions.length === 1 ? 'recording' : 'recordings'}
          </span>
        )}
      </div>

      <div style={{ padding: '0 24px', maxHeight: 600, overflowY: 'auto' }}>
        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 12,
            fontSize: 12, fontFamily: FONTS.body,
            background: '#FFE8E8', color: '#B32B2B', border: '1px solid #F4C2C2',
          }}>
            Could not load your recordings. Pull-to-refresh isn't wired yet — try reopening the tab.
          </div>
        )}

        {loading && sessions.length === 0 && (
          <div style={{ ...glassCard({ textAlign: 'center', padding: '24px 16px' }), color: C.p6, fontFamily: FONTS.body, fontSize: 13 }}>
            Loading…
          </div>
        )}

        {!loading && sessions.length === 0 && !error && (
          <div style={{ ...glassCard({ textAlign: 'center', padding: '32px 18px' }), fontFamily: FONTS.body }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Icon name="folder" size={36} color={C.p6} strokeWidth={1.5} />
            </div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: C.p9, marginBottom: 4 }}>
              No recordings yet
            </div>
            <div style={{ fontSize: 12, color: C.p6, lineHeight: 1.6 }}>
              Tap the record button on the Home tab to start your first session.
              Your recordings will appear here.
            </div>
          </div>
        )}

        {sessions.map(s => {
          // Always show duration so the row layout is consistent — empty
          // recordings render as "0:00" rather than dropping the suffix.
          const subtitle = `${formatSessionDate(s.createdAt)} · ${formatDuration(s.duration || 0)}`
          return (
            <div
              key={s.id}
              style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }) }}
              onClick={() => onDetail(s.id)}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.p4}, ${C.p5})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="2" width="16" height="20" rx="2" stroke={C.p7} strokeWidth="1.8" />
                  <path d="M8 8h8M8 12h8M8 16h5" stroke={C.p7} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1, fontFamily: FONTS.body, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.p9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || 'Untitled recording'}
                </div>
                <div style={{ fontSize: 11, color: C.p6, marginTop: 2 }}>{subtitle}</div>
              </div>
              {s.isStarred && (
                <span style={{ display: 'inline-flex', marginRight: 4 }}>
                  <Icon name="star" size={14} color={C.p7} />
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDetail(s.id); }}
                style={{ background: 'none', border: `1px solid ${C.p5}`, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 500, color: C.p7, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                View
              </button>
            </div>
          )
        })}
      </div>
      <BottomNav active={activeTab} onNavigate={onNavigate} />
    </div>
  )
}

// ── RECORD DETAIL ────────────────────────────────────────────────────
// Loads a single session by ID from Firestore (mirrors getSession in
// lib/services/firestore_service.dart) and bumps lastViewedAt for the
// "Recently viewed" sort. The waveform + transcript area is still mocked
// because real audio + segments will land with the recording flow.
// Inline audio player — single <audio> element + a click-to-seek waveform.
// The bars are deterministic noise (sin curve) so the visual is stable; the
// progress fill follows currentTime / duration. When the session has no
// uploaded audio (older sessions, or upload pipeline not yet wired) the
// player switches to a "no audio" placeholder instead of giving the user
// a broken play button.
const fmtClock = (sec) => {
  const v = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(v / 3600)
  const m = Math.floor((v % 3600) / 60)
  const s = v % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const AudioPlayer = ({ src, fallbackDurationSec = 0 }) => {
  const audioRef = useRef(null)
  const [playing,  setPlaying]  = useState(false)
  const [current,  setCurrent]  = useState(0)
  const [duration, setDuration] = useState(fallbackDurationSec)

  // Reset state whenever the source changes (e.g. user opens another session).
  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(fallbackDurationSec)
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0 } catch {}
    }
  }, [src, fallbackDurationSec])

  const onLoadedMeta = (e) => {
    const d = Number.isFinite(e.target.duration) ? e.target.duration : 0
    if (d > 0) setDuration(d)
  }
  const onTime = (e) => setCurrent(Number(e.target.currentTime) || 0)
  const onEnded = () => { setPlaying(false); setCurrent(duration) }

  const toggle = async () => {
    const a = audioRef.current
    if (!a || !src) return
    try {
      if (a.paused) { await a.play(); setPlaying(true) }
      else          { a.pause();      setPlaying(false) }
    } catch (e) {
      console.warn('[AudioPlayer] play failed', e?.message)
      setPlaying(false)
    }
  }
  const skip = (delta) => {
    const a = audioRef.current
    if (!a || !duration) return
    a.currentTime = Math.min(duration, Math.max(0, (a.currentTime || 0) + delta))
  }
  const seekFromBar = (e) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const a = audioRef.current
    if (a) a.currentTime = ratio * duration
    setCurrent(ratio * duration)
  }

  const BARS = 40
  const progressIdx = duration > 0 ? Math.floor((current / duration) * BARS) : 0

  if (!src) {
    return (
      <div style={{ ...glassCard({ marginBottom: 14, padding: '18px 14px', textAlign: 'center' }) }}>
        <div style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.6 }}>
          Audio for this recording is not available.
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...glassCard({ marginBottom: 14 }) }}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMeta}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        style={{ display: 'none' }}
      />
      {/* Waveform — click anywhere to seek. Bars before progressIdx are filled. */}
      <div
        onClick={seekFromBar}
        style={{ display: 'flex', alignItems: 'center', gap: 2, height: 56, marginBottom: 10, cursor: 'pointer' }}
      >
        {Array.from({ length: BARS }, (_, i) => (
          <div key={i} style={{
            flex: 1,
            background: i < progressIdx ? C.p9 : (i === progressIdx ? C.p7 : C.p4),
            borderRadius: 1,
            height: `${10 + Math.abs(Math.sin(i * .6)) * 40}%`,
            transition: 'background .15s ease',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body }}>{fmtClock(current)}</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            onClick={() => skip(-10)}
            style={{ cursor: duration ? 'pointer' : 'default', opacity: duration ? 1 : 0.4 }}
          >
            <polygon points="19 20 9 12 19 4 19 20" fill={C.p7} />
            <line x1="5" y1="4" x2="5" y2="20" stroke={C.p7} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div
            onClick={toggle}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="4"  width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </div>
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            onClick={() => skip(10)}
            style={{ cursor: duration ? 'pointer' : 'default', opacity: duration ? 1 : 0.4 }}
          >
            <polygon points="5 4 15 12 5 20 5 4" fill={C.p7} />
            <line x1="19" y1="4" x2="19" y2="20" stroke={C.p7} strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body }}>{fmtClock(duration)}</span>
      </div>
    </div>
  )
}

export const RecordDetailScreen = ({ sessionId, onBack, onRename, onDelete, onAiChat, onUpgrade, onGenerateSummary }) => {
  const { profile }             = useAuth()
  const tier                    = profile?.tier || 'free'
  const aiChatAvailable         = limitsForTier(tier).aiChatQueriesPerMonth !== 0
  const [session, setSession]   = useState(null)
  const [segments, setSegments] = useState([])
  const [audioUrl, setAudioUrl] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    let cancelled = false
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const s = await getSession(sessionId)
        if (cancelled) return
        setSession(s)
        // Fire-and-forget — don't block detail render on this.
        if (s) markSessionViewed(sessionId).catch(() => {})
      } catch (e) {
        if (!cancelled) setError(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  // Live transcript stream for this session — replaces the design-time mock
  // dialogue with the real segments persisted by the recording flow.
  useEffect(() => {
    if (!sessionId) { setSegments([]); return }
    const unsub = subscribeSegments(
      sessionId,
      (list) => setSegments(list),
      (err)  => console.error('[RecordDetailScreen] segment stream error', err),
    )
    return unsub
  }, [sessionId])

  // Pull the recording's audio out of the on-device IndexedDB store. We
  // only attempt the lookup once the session doc tells us a local audio
  // exists (`localAudioId`) — sessions created before this flow shipped
  // will simply have none and the player falls back to a "not available"
  // placeholder. The blob URL is revoked when the screen tears down so
  // we don't leak the underlying ArrayBuffer.
  useEffect(() => {
    setAudioUrl(null)
    const key = session?.localAudioId || (session?.id /* legacy: try id directly */)
    if (!key) return
    let cancelled = false
    let createdUrl = null
    getLocalAudioUrl(key).then(url => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      createdUrl = url
      setAudioUrl(url)
    })
    return () => {
      cancelled = true
      if (createdUrl) {
        try { URL.revokeObjectURL(createdUrl) } catch {}
      }
    }
  }, [session?.localAudioId, session?.id])

  if (loading) {
    return (
      <div style={{ animation: 'fadeIn .35s ease' }}>
        <Header title="Meeting Details" onBack={onBack} />
        <div style={{ padding: 24, textAlign: 'center', color: C.p6, fontFamily: FONTS.body, fontSize: 13 }}>
          Loading…
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ animation: 'fadeIn .35s ease' }}>
        <Header title="Meeting Details" onBack={onBack} />
        <div style={{ padding: 24, textAlign: 'center', color: C.p6, fontFamily: FONTS.body, fontSize: 13 }}>
          {error ? 'Could not load this recording.' : 'Recording not found.'}
        </div>
      </div>
    )
  }

  const title    = session.title || 'Untitled recording'
  const subtitle = `${formatSessionDate(session.createdAt)} · ${formatDuration(session.duration)}`

  return (
  <div style={{ animation: 'fadeIn .35s ease' }}>
    <Header title="Meeting Details" onBack={onBack} />
    <div style={{ padding: '0 24px', maxHeight: 680, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          title={title}
          style={{
            flex: 1, minWidth: 0,
            fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: C.p9,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onRename} aria-label="Rename" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={C.p7} strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18.5 2.5L21.5 5.5L12 15H9V12L18.5 2.5Z" stroke={C.p7} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {onDelete && (
            <button onClick={onDelete} aria-label="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" stroke="#E53935" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginBottom: 12 }}>
        {subtitle}
      </div>
      {/* Audio player — real <audio> backed by Storage when a path is set,
          otherwise a "no audio" placeholder. */}
      <AudioPlayer src={audioUrl} fallbackDurationSec={session.duration || 0} />
      {/* Transcript */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 18, background: C.p9, borderRadius: 2 }} />
        <span style={{ fontFamily: FONTS.heading, fontSize: 14, fontWeight: 600, color: C.p9 }}>Meeting Content</span>
      </div>
      {segments.length === 0 ? (
        <div style={{ ...glassCard({ marginBottom: 10, padding: '14px 14px', textAlign: 'center' }) }}>
          <div style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.6 }}>
            No transcript yet. Start a recording on the Home tab — segments
            will appear here as they are streamed back from the server.
          </div>
        </div>
      ) : (
        segments.map((s, i) => {
          const speakerLabel = (session.speakerNames && session.speakerNames[s.speakerIndex])
            || `Speaker ${1 + (s.speakerIndex || 0)}`
          const tx = s.translatedText || s.originalText || ''
          if (!tx) return null
          return (
            <div key={s.id || i} style={{ ...glassCard({ marginBottom: 10, padding: '12px 14px' }) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.p7, fontFamily: FONTS.body }}>{speakerLabel}</span>
                <span style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body }}>{formatTimestamp(s.startTime)}</span>
              </div>
              <p style={{ fontSize: 13, color: C.p6, lineHeight: 1.6, margin: 0, fontFamily: FONTS.body }}>{tx}</p>
            </div>
          )
        })
      )}
      {/* Ask AI — visible on every tier so the user knows the feature
          exists. On Free we render it as a "paid feature" teaser: greyed
          out, lock badge in the corner, click jumps to Membership so the
          user can upgrade. On paid tiers it opens the chat normally. */}
      {onAiChat && (
        aiChatAvailable ? (
          <button
            onClick={onAiChat}
            style={gradientButton({
              marginBottom: 10,
              background: 'rgba(255,255,255,0.78)',
              color: C.p9,
              border: `1.5px solid ${C.p5}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            })}
          >
            <Icon name="chat" size={16} color={C.p9} strokeWidth={1.8} />
            Ask AI about this recording
          </button>
        ) : (
          <button
            onClick={onUpgrade}
            style={gradientButton({
              marginBottom: 10,
              background: 'rgba(255,255,255,0.55)',
              color: C.p6,
              border: `1.5px dashed ${C.p4}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              position: 'relative',
            })}
            title="Upgrade to unlock AI chat"
          >
            <Icon name="chat" size={16} color={C.p6} strokeWidth={1.8} />
            Ask AI about this recording
            {/* Lock badge — top-right corner of the button. */}
            <span style={{
              position: 'absolute', top: -8, right: -8,
              width: 22, height: 22, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(74,32,112,.35)',
            }}>
              <Icon name="lock" size={12} color="#fff" strokeWidth={2} />
            </span>
          </button>
        )
      )}
      <button onClick={onGenerateSummary} style={gradientButton({ marginBottom: 24 })}>Generate Summary</button>
    </div>
  </div>
  )
}

// MM:SS formatter — used by the meeting detail transcript timestamps.
// Lives at module scope so RecordDetailScreen can call it from JSX.
const formatTimestamp = (s) => {
  const v = Math.max(0, Math.floor(Number(s) || 0))
  const m = Math.floor(v / 60)
  const r = v % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

// Render an assistant message with [MM:SS] timestamps turned into
// click-to-seek pill chips. Used inside AiChatScreen.
const renderAssistantContent = (text, onPickTime) => {
  if (!text) return null
  const re = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g
  const parts = []
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10), c = m[3] ? parseInt(m[3], 10) : null
    const seconds = c == null ? a * 60 + b : a * 3600 + b * 60 + c
    parts.push(
      <span
        key={`ts-${m.index}`}
        onClick={() => onPickTime?.(seconds)}
        style={{
          display: 'inline-block',
          padding: '1px 6px', margin: '0 2px',
          borderRadius: 6,
          background: C.p4, color: C.p9,
          fontSize: 11, fontWeight: 600, fontFamily: FONTS.heading,
          cursor: onPickTime ? 'pointer' : 'default',
          verticalAlign: 'baseline',
        }}
      >{formatTimestamp(seconds)}</span>
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// ── AI CHAT ──────────────────────────────────────────────────────────
// Sits behind a tier-gate (Free has no AI chat at all). For Advance the
// hook is called with `models: ['haiku']`; Premium / Professional pass
// both models + autoRoute=true so the Cloud Function can promote complex
// questions to Sonnet. The screen also blocks input when the session
// has no transcript (the AI would have nothing to ground its answer on).
export const AiChatScreen = ({ sessionId, onBack, onJumpToTime }) => {
  const { profile } = useAuth()
  const tier        = profile?.tier || 'free'
  const limits      = limitsForTier(tier)
  const aiOptions   = useMemo(() => ({
    models:    limits.models    || [],
    autoRoute: limits.autoRoute || false,
    priority:  limits.priority  || false,
  }), [limits.models, limits.autoRoute, limits.priority])

  const {
    messages, isLoading, error, queriesUsed, queryLimit, isAtLimit,
    lastModelUsed, sendMessage, clearError,
  } = useAiChat(sessionId, aiOptions)

  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)

  // Live transcript check — block sends when there's nothing for the AI
  // to ground on so the user doesn't burn quota on a confused reply.
  const [segments, setSegments] = useState([])
  const [segmentsReady, setSegmentsReady] = useState(false)
  useEffect(() => {
    if (!sessionId) { setSegments([]); setSegmentsReady(true); return }
    setSegmentsReady(false)
    const unsub = subscribeSegments(
      sessionId,
      (list) => { setSegments(list); setSegmentsReady(true) },
      (err)  => { console.error('[AiChatScreen] segment stream error', err); setSegmentsReady(true) },
    )
    return unsub
  }, [sessionId])
  const hasTranscript = segments.some(s => (s.originalText || s.translatedText || '').trim().length > 0)

  const tierLocked    = limits.aiChatQueriesPerMonth === 0
  const blockedReason = tierLocked
    ? 'AI chat is not available on the Free plan'
    : !sessionId
      ? 'Pick a recording first'
      : (segmentsReady && !hasTranscript)
        ? 'No transcript yet — record some audio first'
        : null
  const inputDisabled = isAtLimit || isLoading || !!blockedReason

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, isLoading])

  const submit = () => {
    const text = draft.trim()
    if (!text || inputDisabled) return
    setDraft('')
    sendMessage(text)
  }

  return (
    <div style={{ animation: 'fadeIn .35s ease', display: 'flex', flexDirection: 'column', height: 722 }}>
      <Header title="AI Chat" onBack={onBack} right={
        queryLimit > 0 ? (
          <span style={{ fontSize: 11, color: isAtLimit ? '#E53935' : C.p7, fontFamily: FONTS.body, fontWeight: 600 }}>
            {queriesUsed}/{queryLimit}
          </span>
        ) : (queriesUsed > 0 ? (
          <span style={{ fontSize: 11, color: C.p7, fontFamily: FONTS.body, fontWeight: 600 }}>
            {queriesUsed} used
          </span>
        ) : null)
      } />

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 12px' }}>
        {messages.length === 0 && !isLoading && !error && (
          <div style={{ ...glassCard({ textAlign: 'center', padding: '22px 16px', marginTop: 24 }), fontFamily: FONTS.body }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Icon name="chat" size={32} color={C.p6} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.p9, fontFamily: FONTS.heading, marginBottom: 4 }}>
              {tierLocked ? 'AI chat is a paid feature'
                : blockedReason ? 'Nothing to chat about yet'
                : 'Ask about this recording'}
            </div>
            <div style={{ fontSize: 12, color: C.p6, lineHeight: 1.5 }}>
              {tierLocked
                ? 'Upgrade to Advance, Premium, or Professional to chat with your meetings.'
                : blockedReason
                  ? 'Record some audio on the Home tab first — the AI needs a transcript to ground its answers.'
                  : (limits.autoRoute
                      ? 'Ask anything about this recording. Tough questions are automatically routed to a deeper model. Try: "What were the main decisions?" or "Compare the two proposals."'
                      : 'Ask anything about this recording. Try: "What were the main decisions?" or "Summarize the first 5 minutes."')}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === 'user'
          return (
            <div
              key={m.id || i}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 10,
              }}
            >
              <div style={{
                maxWidth: '82%',
                padding: '10px 13px',
                borderRadius: 14,
                fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: isUser
                  ? `linear-gradient(135deg, ${C.p7}, ${C.p9})`
                  : 'rgba(255,255,255,0.85)',
                color: isUser ? 'white' : C.p9,
                border: isUser ? 'none' : `1.5px solid ${C.p4}`,
                opacity: m._optimistic ? 0.7 : 1,
              }}>
                {isUser
                  ? m.content
                  : renderAssistantContent(m.content, onJumpToTime)}
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <div style={{
              padding: '10px 13px', borderRadius: 14,
              background: 'rgba(255,255,255,0.85)', border: `1.5px solid ${C.p4}`,
              fontFamily: FONTS.body, fontSize: 13, color: C.p6,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.p7, animation: 'pulse 1.2s ease-in-out infinite' }} />
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <div
            onClick={clearError}
            style={{
              padding: '10px 12px', borderRadius: 10,
              fontSize: 12, fontFamily: FONTS.body,
              background: '#FFE8E8', color: '#B32B2B',
              border: '1px solid #F4C2C2', cursor: 'pointer',
            }}
          >{error} <span style={{ opacity: 0.7 }}>(tap to dismiss)</span></div>
        )}

        {lastModelUsed === 'pro' && !isLoading && (
          <div style={{
            margin: '4px 0 8px',
            fontSize: 10, color: C.p6, fontFamily: FONTS.body, textAlign: 'center', opacity: 0.7,
          }}>
            Routed to deeper model for this answer
          </div>
        )}
      </div>

      <div style={{
        padding: '10px 16px 14px',
        borderTop: `1px solid ${C.p4}`,
        background: 'rgba(255,255,255,0.55)',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder={
            isAtLimit ? 'Query limit reached' :
            blockedReason ? blockedReason :
            'Ask anything about this recording…'
          }
          disabled={inputDisabled}
          style={{
            ...glassInput({ marginBottom: 0, padding: '10px 14px', fontSize: 13 }),
            flex: 1,
            opacity: inputDisabled ? 0.6 : 1,
          }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || inputDisabled}
          aria-label="Send"
          style={{
            width: 40, height: 40, borderRadius: '50%',
            border: 'none',
            background: (!draft.trim() || inputDisabled)
              ? C.p4
              : `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
            color: 'white',
            cursor: (!draft.trim() || inputDisabled) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 12L19 5L12 19L10 14L5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── PROFILE ──────────────────────────────────────────────────────────
// Reads displayName, uid, tier, and default target language from the live
// Firebase auth user + Firestore profile (via useAuth). Mirrors the high-
// level header from lib/screens/profile/profile_screen.dart.
export const ProfileScreen = ({ activeTab, onNavigate, onPersonalInfo, onLogout }) => {
  const { user, profile } = useAuth()
  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Sheen User'
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()
  const uidShort = user?.uid ? user.uid.slice(0, 8) : '—'
  const tier = tierLabel(profile?.tier)
  const langCode = profile?.defaultTargetLanguage || 'en'

  const menu = [
    { label: 'Membership',          iconName: 'crown',   screen: 'memberInfo2',    sub: tier },
    { label: 'Usage',               iconName: 'chart',   screen: 'usage' },
    { label: 'Linked Accounts',     iconName: 'link',    screen: 'accountBinding' },
    { label: 'Language',            iconName: 'globe',   screen: 'langSelect',     sub: languageLabel(langCode) },
    { label: 'Privacy Permissions', iconName: 'lock',    screen: 'privacyPerm'   },
    { label: 'Delete Account',      iconName: 'warning', screen: 'cancelAccount',  danger: true },
  ]

  return (
    <div style={{ position: 'relative', minHeight: 700, animation: 'fadeIn .35s ease' }}>
      <div style={{ padding: '8px 24px 0' }}>
        <span style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 700, color: C.p9 }}>Profile</span>
      </div>
      <div style={{ padding: '14px 24px', maxHeight: 640, overflowY: 'auto' }}>
        <div onClick={onPersonalInfo} style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, cursor: 'pointer' }) }}>
          <div style={{
            width: 54, height: 54, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700,
            color: 'white', flexShrink: 0,
          }}>{initial}</div>
          <div style={{ flex: 1, fontFamily: FONTS.body, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.p9, fontFamily: FONTS.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </div>
            <div style={{ fontSize: 12, color: C.p6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || `ID: ${uidShort}`}
            </div>
          </div>
          <div style={{ background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'white', fontFamily: FONTS.body }}>{tier}</div>
        </div>
        {menu.map((item, i) => (
          <div key={i} onClick={() => onNavigate(item.screen)} style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', border: `1.5px solid ${item.danger ? '#FFDDDD' : C.p4}` }) }}>
            <span style={{ display: 'inline-flex' }}>
              <Icon name={item.iconName} size={20} color={item.danger ? '#E53935' : C.p7} strokeWidth={1.7} />
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: item.danger ? '#E53935' : C.p9, fontFamily: FONTS.body }}>{item.label}</span>
            {item.sub && <span style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body }}>{item.sub}</span>}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke={item.danger ? '#E53935' : C.p6} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        ))}
        <button onClick={onLogout} style={gradientButton({ background: 'transparent', color: '#E53935', border: '1.5px solid #FFDDDD', marginTop: 6 })}>Log Out</button>
      </div>
      <BottomNav active={activeTab} onNavigate={onNavigate} />
    </div>
  )
}

// ── PERSONAL INFO ────────────────────────────────────────────────────
// Live-edits user fields in Firestore. Each row tap reveals an inline editor;
// saving writes to Firestore (and Firebase Auth for displayName) and updates
// the cached profile in AuthContext so the UI reflects the change instantly.
// Mirrors lib/screens/profile/personal_info_screen.dart's field set.
const InfoRow = ({ label, value, type = 'text', options, onSave, editable = true }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)

  const open = () => {
    if (!editable) return
    setDraft(value == null ? '' : String(value))
    setErr(null)
    setEditing(true)
  }
  const cancel = () => { setEditing(false); setErr(null) }
  const save = async () => {
    if (saving) return
    setSaving(true); setErr(null)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch (e) {
      console.error('[InfoRow] save failed', e)
      setErr('Save failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div
        onClick={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', borderBottom: `1px solid ${C.p4}`,
          cursor: editable ? 'pointer' : 'default', fontFamily: FONTS.body,
        }}
      >
        <span style={{ fontSize: 14, color: C.p6 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 14, color: C.p9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value == null || value === '' ? '—' : value}
          </span>
          {editable && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke={C.p6} strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.p4}`, fontFamily: FONTS.body }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.p7, letterSpacing: '.5px', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </label>
      {type === 'select' ? (
        <select
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          style={{
            width: '100%', appearance: 'none', WebkitAppearance: 'none',
            background: 'rgba(255,255,255,.7)', border: `1.5px solid ${C.p4}`,
            borderRadius: 12, padding: '11px 36px 11px 14px',
            fontSize: 14, color: C.p9, fontFamily: FONTS.body, cursor: 'pointer',
          }}
        >
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          autoFocus
          type={type}
          inputMode={type === 'number' ? 'numeric' : 'text'}
          value={draft}
          onChange={e => {
            const v = type === 'number' ? e.target.value.replace(/\D/g, '').slice(0, 3) : e.target.value
            setDraft(v)
          }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          style={{ ...glassInput({}) }}
        />
      )}
      {err && <div style={{ fontSize: 11, color: '#B32B2B', marginTop: 6 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={cancel}
          disabled={saving}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 10,
            border: `1px solid ${C.p4}`, background: 'transparent',
            color: C.p6, fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
          }}
        >Cancel</button>
        <button
          onClick={save}
          disabled={saving}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 10,
            border: 'none', background: `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
            color: 'white', fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

export const PersonalInfoScreen = ({ onBack, onLogout }) => {
  const { user, profile, setProfile } = useAuth()
  const displayName = profile?.displayName || user?.displayName || ''
  const initial = (displayName || user?.email || '?').trim().charAt(0).toUpperCase()

  // Persists a single field. For displayName we also push to Firebase Auth so
  // it's reflected in user.displayName everywhere (including future sessions).
  const saveField = async (field, value) => {
    if (!user) return
    const empty = value === '' || value == null
    if (field === 'displayName') {
      await updateDisplayNameInAuth(empty ? null : value)
      await updateUser(user.uid, { displayName: empty ? '' : value })
      setProfile?.(p => ({ ...(p || { uid: user.uid }), displayName: empty ? '' : value }))
      return
    }
    if (field === 'age') {
      const n = empty ? null : Number.parseInt(value, 10)
      await updateUser(user.uid, { age: Number.isFinite(n) ? n : null })
      setProfile?.(p => ({ ...(p || { uid: user.uid }), age: Number.isFinite(n) ? n : null }))
      return
    }
    await updateUser(user.uid, { [field]: empty ? null : value })
    setProfile?.(p => ({ ...(p || { uid: user.uid }), [field]: empty ? null : value }))
  }

  const showMajor = profile?.occupation === 'Education/Student'

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title="Personal Info" onBack={onBack} />
      <div style={{ padding: '0 24px', maxHeight: 680, overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`,
            margin: '0 auto 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONTS.heading, fontSize: 26, fontWeight: 700, color: 'white',
          }}>{initial}</div>
          <div style={{ fontSize: 13, color: C.p6, fontFamily: FONTS.body, marginTop: 4 }}>
            {user?.email || ''}
          </div>
        </div>

        <InfoRow
          label="Name"
          value={displayName}
          onSave={v => saveField('displayName', v)}
        />
        <InfoRow
          label="Email"
          value={user?.email || ''}
          editable={false}
        />
        <InfoRow
          label="Country"
          type="select"
          options={COUNTRIES}
          value={profile?.country || ''}
          onSave={v => saveField('country', v)}
        />
        <InfoRow
          label="Age"
          type="number"
          value={profile?.age == null ? '' : String(profile.age)}
          onSave={v => saveField('age', v)}
        />
        <InfoRow
          label="Occupation"
          type="select"
          options={OCCUPATIONS}
          value={profile?.occupation || ''}
          onSave={v => saveField('occupation', v)}
        />
        {showMajor && (
          <InfoRow
            label="Major"
            value={profile?.major || ''}
            onSave={v => saveField('major', v)}
          />
        )}

        <button
          onClick={onLogout}
          style={gradientButton({ background: 'transparent', color: '#E53935', border: '1.5px solid #FFDDDD', marginTop: 24, marginBottom: 24 })}
        >
          Log Out
        </button>
      </div>
    </div>
  )
}

// EditNicknameScreen kept only as a no-op fallback route; the inline editor
// inside PersonalInfoScreen is the primary way to edit the display name now.
export const EditNicknameScreen = ({ onBack }) => (
  <div style={{ animation: 'fadeIn .35s ease' }}>
    <Header title="Edit Name" onBack={onBack} />
    <div style={{ padding: '24px', textAlign: 'center', color: C.p6, fontFamily: FONTS.body }}>
      Tap the Name row in Personal Info to edit it inline.
    </div>
  </div>
)

// ── LANGUAGE SELECT ──────────────────────────────────────────────────
// Updates user.defaultTargetLanguage in Firestore. Mirrors the language
// preference in lib/models/user_model.dart used by the recording/translation
// flow. Selection is persisted on tap (no "Save" button needed).
export const LangSelectScreen = ({ onBack }) => {
  const { user, profile, setProfile } = useAuth()
  const current = profile?.defaultTargetLanguage || 'en'
  const [busyCode, setBusyCode] = useState(null)
  const [error, setError]       = useState(null)

  const choose = async (code) => {
    if (!user || code === current || busyCode) return
    setError(null); setBusyCode(code)
    try {
      await updateUser(user.uid, { defaultTargetLanguage: code })
      setProfile?.(p => ({ ...(p || { uid: user.uid }), defaultTargetLanguage: code }))
    } catch (e) {
      console.error('[LangSelect] save failed', e)
      setError('Could not save language preference.')
    } finally {
      setBusyCode(null)
    }
  }

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title="Language" onBack={onBack} />
      <div style={{ padding: '8px 24px' }}>
        <p style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body, margin: '0 0 12px' }}>
          Default translation target language for new recordings.
        </p>
        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 10, marginBottom: 12,
            fontSize: 12, fontFamily: FONTS.body,
            background: '#FFE8E8', color: '#B32B2B', border: '1px solid #F4C2C2',
          }}>{error}</div>
        )}
        {SUPPORTED_LANGUAGES.map(({ code, name }) => {
          const selected = code === current
          return (
            <div
              key={code}
              onClick={() => choose(code)}
              style={{ ...glassCard({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: busyCode ? 'wait' : 'pointer' }) }}
            >
              <span style={{ fontSize: 14, color: C.p9, fontFamily: FONTS.body }}>{name}</span>
              {selected ? (
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.p7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>
              ) : busyCode === code ? (
                <span style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body }}>Saving…</span>
              ) : null}
            </div>
          )
        })}
        <button onClick={onBack} style={gradientButton({ marginTop: 8 })}>Done</button>
      </div>
    </div>
  )
}

// ── ACCOUNT BINDING ──────────────────────────────────────────────────
// Reads linked sign-in providers from the live Firebase auth user. The
// providerData entries we care about are 'password' (email/pw), 'google.com',
// and 'apple.com' — same as lib/services/auth_service.dart's checks.
export const AccountBindingScreen = ({ onBack }) => {
  const { user } = useAuth()
  const providerIds = (user?.providerData || []).map(p => p.providerId)
  const has = (id) => providerIds.includes(id)
  const emailEntry = (user?.providerData || []).find(p => p.providerId === 'password')

  const rows = [
    {
      label: 'Email & Password',
      detail: has('password') ? (emailEntry?.email || user?.email || '') : '',
      linked: has('password'),
    },
    {
      label: 'Google',
      detail: has('google.com')
        ? ((user.providerData.find(p => p.providerId === 'google.com')?.email) || '')
        : '',
      linked: has('google.com'),
    },
    {
      label: 'Apple',
      detail: has('apple.com')
        ? ((user.providerData.find(p => p.providerId === 'apple.com')?.email) || 'Linked')
        : '',
      linked: has('apple.com'),
    },
  ]

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title="Linked Accounts" onBack={onBack} />
      <div style={{ padding: '8px 24px' }}>
        {rows.map(r => (
          <div key={r.label} style={{ ...glassCard({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }) }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, color: C.p9, fontFamily: FONTS.body }}>{r.label}</div>
              {r.detail && (
                <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.detail}
                </div>
              )}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: FONTS.body,
              padding: '4px 10px', borderRadius: 8,
              background: r.linked ? `${C.p4}` : 'rgba(255,184,184,.4)',
              color: r.linked ? C.p9 : '#B32B2B',
            }}>
              {r.linked ? 'Linked' : 'Not linked'}
            </span>
          </div>
        ))}
        <p style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.5, margin: '12px 2px' }}>
          To link or unlink a provider, sign out and sign back in with the
          method you want to add. Provider linking flows will be added in a
          later release.
        </p>
        <button onClick={onBack} style={gradientButton({ marginTop: 8 })}>Done</button>
      </div>
    </div>
  )
}

// ── PRIVACY PERMISSIONS ──────────────────────────────────────────────
export const PrivacyPermScreen = ({ onBack, onPrivacy, onAgreement }) => (
  <div style={{ animation: 'fadeIn .35s ease' }}>
    <Header title="Privacy Permissions" onBack={onBack} />
    <div style={{ padding: '8px 24px' }}>
      {[
        { l: 'Privacy Policy', action: onPrivacy },
        { l: 'Terms of Service', action: onAgreement },
        { l: 'Trusted Contacts', sub: 'Allowed', action: null },
      ].map((r, i) => (
        <div key={i} onClick={r.action || undefined} style={{ ...glassCard({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: r.action ? 'pointer' : 'default' }) }}>
          <span style={{ fontSize: 14, color: C.p9, fontFamily: FONTS.body }}>{r.l}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.sub && <span style={{ fontSize: 12, color: C.p7, fontFamily: FONTS.body }}>{r.sub}</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={C.p6} strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#E53935', lineHeight: 1.6, padding: '0 2px', marginTop: 8, fontFamily: FONTS.body }}>
        No phone number linked. Without another linked account, you will not be able to access this account's data.
      </div>
    </div>
  </div>
)

// ── USAGE ────────────────────────────────────────────────────────────
// Per-month usage dashboard + top-up store. Bars consume the current
// billing month so the user sees how close they are to their tier cap;
// top-up cards are tier-priced (Free pays the steepest rate so that
// subscribing always wins on a per-hour basis).
const fmtHours = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m < 60) return `${m} min`
  const h = m / 60
  return `${(Math.round(h * 10) / 10).toFixed(h >= 10 ? 0 : 1)} h`
}
const startOfMonth = (d = new Date()) => {
  const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x
}
const startOfNextMonth = (d = new Date()) => {
  const x = startOfMonth(d); x.setMonth(x.getMonth() + 1); return x
}
const Bar = ({ used, total, locked = false }) => {
  const cap   = total > 0 ? total : 1
  const ratio = locked ? 0 : Math.min(1, used / cap)
  return (
    <div style={{
      height: 8, borderRadius: 4,
      background: 'rgba(189,162,218,.25)',
      overflow: 'hidden', marginTop: 6,
    }}>
      <div style={{
        height: '100%',
        width: `${ratio * 100}%`,
        borderRadius: 4,
        background: locked
          ? C.p4
          : ratio >= 1
            ? '#E53935'
            : `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
        transition: 'width .35s ease',
      }} />
    </div>
  )
}
export const UsageScreen = ({ onBack, onUpgrade }) => {
  const { user, profile } = useAuth()
  const tier   = profile?.tier || 'free'
  const limits = limitsForTier(tier)
  const { sessions } = useSessions(user?.uid)

  // Sum recording minutes for the current billing month.
  const usage = useMemo(() => {
    const ms = startOfMonth()
    const me = startOfNextMonth()
    let mins = 0
    for (const s of sessions || []) {
      const created = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt)
      if (created >= ms && created < me) {
        // duration is stored as seconds.
        mins += (Number(s.duration) || 0) / 60
      }
    }
    return Math.max(0, mins)
  }, [sessions])

  // AI usage tracker — server writes this on each chat call. We display
  // it best-effort; if the field isn't there yet we render 0 / cap.
  const aiUsed = Number(profile?.aiQueriesUsedThisMonth || profile?.aiQueriesUsed || 0)

  // Bonus minutes / queries from any one-time top-ups the user has bought
  // (server flips these counters when Stripe webhook fires; client just
  // reads + displays them).
  const bonusMins = Number(profile?.bonusMinutes  || 0)
  const bonusAi   = Number(profile?.bonusAiQueries || 0)

  const recCap = limits.recordingMinutesPerMonth + bonusMins
  const aiCap  = limits.aiChatQueriesPerMonth    + bonusAi
  const aiLocked = aiCap === 0

  const resetDate = startOfNextMonth().toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const [confirming, setConfirming] = useState(null)   // pkg id awaiting confirm

  const onPickPack = (pkg) => {
    // Stripe checkout isn't wired yet — surface a clear placeholder so
    // the user knows the purchase didn't happen silently.
    setConfirming(pkg.id)
    setTimeout(() => setConfirming(null), 2000)
  }

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header
        title="Usage"
        onBack={onBack}
        right={
          <span style={{
            fontSize: 11, fontFamily: FONTS.body, fontWeight: 600,
            color: 'white', padding: '3px 10px', borderRadius: 10,
            background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`,
          }}>{tierLabel(tier)}</span>
        }
      />
      <div style={{ padding: '0 24px', maxHeight: 680, overflowY: 'auto' }}>
        {/* Period header */}
        <div style={{
          fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600, color: C.p9,
          marginBottom: 8,
        }}>This Month</div>

        {/* Recording bar */}
        <div style={{ ...glassCard({ padding: '14px 16px', marginBottom: 10 }) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="chart" size={16} color={C.p7} strokeWidth={1.8} />
              <span style={{ fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600, color: C.p9 }}>Recording</span>
            </div>
            <span style={{ fontFamily: FONTS.body, fontSize: 12, color: C.p6 }}>
              {fmtHours(usage)} / {fmtHours(recCap)}
            </span>
          </div>
          <Bar used={usage} total={recCap} />
          {bonusMins > 0 && (
            <div style={{ fontSize: 10, color: C.p7, fontFamily: FONTS.body, marginTop: 5 }}>
              Includes {fmtHours(bonusMins)} from top-ups
            </div>
          )}
        </div>

        {/* AI bar */}
        <div style={{ ...glassCard({ padding: '14px 16px', marginBottom: 10 }) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="chat" size={16} color={C.p7} strokeWidth={1.8} />
              <span style={{ fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600, color: C.p9 }}>AI Assistant</span>
            </div>
            <span style={{ fontFamily: FONTS.body, fontSize: 12, color: aiLocked ? C.p5 : C.p6 }}>
              {aiLocked ? 'Locked' : `${aiUsed} / ${aiCap}`}
            </span>
          </div>
          <Bar used={aiUsed} total={aiCap} locked={aiLocked} />
          {aiLocked && (
            <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginTop: 6, lineHeight: 1.5 }}>
              Upgrade to Advance, Premium, or Professional to unlock the AI assistant.
            </div>
          )}
        </div>

        {/* Reset date */}
        <div style={{
          fontFamily: FONTS.body, fontSize: 11, color: C.p6,
          marginBottom: 18, textAlign: 'center',
        }}>
          Resets {resetDate}
        </div>

        {/* Top-up packs */}
        <div style={{
          fontFamily: FONTS.heading, fontSize: 13, fontWeight: 600, color: C.p9,
          marginBottom: 8,
        }}>{tier === 'free' ? 'Need more time?' : 'Top up'}</div>

        {TOPUP_PACKAGES.map(pkg => {
          const price = topupPriceFor(pkg, tier)
          const perHr = price / pkg.hours
          const isConfirming = confirming === pkg.id
          return (
            <div
              key={pkg.id}
              onClick={() => !isConfirming && onPickPack(pkg)}
              style={{
                ...glassCard({
                  marginBottom: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10,
                }),
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONTS.heading, fontSize: 14, fontWeight: 600, color: C.p9 }}>
                  +{pkg.hours} hours
                </div>
                <div style={{ fontFamily: FONTS.body, fontSize: 11, color: C.p6, marginTop: 2 }}>
                  Includes {pkg.aiQueries} AI queries · ${perHr.toFixed(2)}/hr
                </div>
              </div>
              <div style={{
                fontFamily: FONTS.heading, fontSize: 14, fontWeight: 700,
                padding: '6px 12px', borderRadius: 10, flexShrink: 0,
                background: isConfirming
                  ? '#FFF4E0'
                  : `linear-gradient(135deg, ${C.p7}, ${C.p9})`,
                color: isConfirming ? '#B7791F' : 'white',
              }}>
                {isConfirming ? 'Coming soon' : `$${price.toFixed(2)}`}
              </div>
            </div>
          )
        })}

        {/* Subscribe CTA — Free users get this big banner so the cheaper
            per-hour math jumps out vs. one-off top-ups. Paid users see a
            quieter "manage plan" link instead. */}
        {tier === 'free' ? (
          <div style={{
            marginTop: 8, marginBottom: 24,
            background: `linear-gradient(135deg, ${C.p4}, rgba(255,255,255,.6))`,
            border: `1.5px solid ${C.p5}`,
            borderRadius: 16, padding: '14px 16px',
          }}>
            <div style={{ fontFamily: FONTS.heading, fontSize: 13, fontWeight: 700, color: C.p9, marginBottom: 4 }}>
              Subscribe and save
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: C.p6, lineHeight: 1.5, marginBottom: 10 }}>
              Advance gets you 6 hours every month plus the AI assistant for $9.99 — that's $1.66/hr, less than half the top-up rate.
            </div>
            <button
              onClick={onUpgrade}
              style={gradientButton({ marginBottom: 0, padding: '10px 0', fontSize: 13 })}
            >View plans</button>
          </div>
        ) : (
          <button
            onClick={onUpgrade}
            style={gradientButton({
              background: 'transparent',
              color: C.p7,
              border: `1.5px solid ${C.p4}`,
              marginTop: 8, marginBottom: 24,
              padding: '10px 0', fontSize: 13,
            })}
          >Manage subscription</button>
        )}
      </div>
    </div>
  )
}

// ── MEMBER INFO 2 (subscribed) ───────────────────────────────────────
// Reads the user's actual tier from Firestore and surfaces it both as the
// header pill and as the "active" plan card. Tier IDs in the user doc
// ('free', 'basic', 'pro', 'unlimited') are mapped to the marketing plan
// IDs are now canonical 1:1 (free / advance / premium / professional).
// Older tier values are mapped onto the closest current tier.
const TIER_TO_PLAN_ID = {
  free:         'free',
  advance:      'advance',
  premium:      'premium',
  professional: 'professional',
  // legacy
  basic:        'free',
  advanced:     'advance',
  pro:          'professional',
  unlimited:    'professional',
}
export const MemberInfo2Screen = ({ onBack, onUpgrade }) => {
  const { profile } = useAuth()
  const tier         = profile?.tier || 'free'
  const activeId     = TIER_TO_PLAN_ID[tier] || 'basic'
  const activePlan   = PLANS.find(p => p.id === activeId) || PLANS[0]
  const otherPlans   = PLANS.filter(p => p.id !== activeId)
  const badgeLabel   = tierLabel(tier)
  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title="Membership" onBack={onBack} />
      <div style={{ padding: '0 24px', maxHeight: 680, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ background: `linear-gradient(135deg, ${C.p5}, ${C.p7})`, borderRadius: 12, padding: '5px 18px', fontSize: 12, fontWeight: 600, color: 'white', fontFamily: FONTS.body }}>
            {badgeLabel}
          </div>
        </div>
        <PlanCard plan={activePlan} subscribed onPress={() => {}} />
        <div style={{ fontSize: 13, fontWeight: 600, color: C.p9, fontFamily: FONTS.body, marginBottom: 10 }}>Change Your Plan</div>
        {otherPlans.map(plan => (
          <PlanCard key={plan.id} plan={plan} onPress={onUpgrade} />
        ))}
      </div>
    </div>
  )
}

// ── CANCEL ACCOUNT ───────────────────────────────────────────────────
// "Confirm Deletion" stays disabled until the consent checkbox is ticked,
// matching the Flutter screen's behavior. Tapping the row toggles the box.
export const CancelAccountScreen = ({ onBack, onCancel }) => {
  const [consented, setConsented] = useState(false)
  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title="Delete Account" onBack={onBack} />
      <div style={{ padding: '16px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <Icon name="warning" size={48} color="#E53935" strokeWidth={1.6} />
          </div>
          <div style={{ fontFamily: FONTS.heading, fontSize: 22, fontWeight: 700, color: C.p9, marginBottom: 8 }}>Are you sure?</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF0F0', borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#E53935' }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#E53935' }} />
            This action is permanent.
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.p6, lineHeight: 1.7, marginBottom: 16, fontFamily: FONTS.body }}>
          Once you confirm deletion, your account and associated data cannot be recovered. Please review what you need before continuing.
        </p>
        {[
          { iconName: 'user',      t: 'Personal Identity Info', s: 'Including your avatar, nickname, and phone number' },
          { iconName: 'clipboard', t: 'Meeting Records',        s: 'All historical meeting records in the app' },
        ].map((r, i) => (
          <div key={i} style={{ ...glassCard({ display: 'flex', alignItems: 'center', gap: 12 }) }}>
            <span style={{ display: 'inline-flex' }}>
              <Icon name={r.iconName} size={22} color={C.p7} strokeWidth={1.7} />
            </span>
            <div style={{ fontFamily: FONTS.body }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.p9 }}>{r.t}</div>
              <div style={{ fontSize: 11, color: C.p6 }}>{r.s}</div>
            </div>
          </div>
        ))}
        <div
          onClick={() => setConsented(c => !c)}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 0 18px', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 6,
            border: `1.5px solid ${consented ? C.p7 : C.p5}`,
            background: consented ? `linear-gradient(135deg, ${C.p7}, ${C.p9})` : 'rgba(255,255,255,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background .15s ease, border-color .15s ease',
          }}>
            {consented && (
              <svg width="11" height="9" viewBox="0 0 11 9">
                <path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.p6, lineHeight: 1.5, fontFamily: FONTS.body }}>
            I have read and understood the above, and confirm deletion of this account and all associated digital assets.
          </div>
        </div>
        <button
          onClick={consented ? onCancel : undefined}
          disabled={!consented}
          style={gradientButton({
            background: consented ? 'linear-gradient(135deg,#E53935,#B71C1C)' : C.p4,
            color: consented ? '#fff' : C.p6,
            cursor: consented ? 'pointer' : 'not-allowed',
            marginBottom: 10,
            opacity: consented ? 1 : 0.7,
          })}
        >Confirm Deletion</button>
        <button onClick={onBack} style={gradientButton({ background: 'transparent', color: C.p6, border: `1px solid ${C.p4}` })}>Cancel</button>
      </div>
    </div>
  )
}

// ── PRIVACY / AGREEMENT TEXT ─────────────────────────────────────────
// Plain-language summary of how Sheen AI handles user data and what the
// terms of service cover. Treat this as a placeholder until Legal hands
// over final copy — it should NOT be substituted for actual legal review.
const LEGAL_COPY = {
  privacy: [
    { h: 'What we collect',
      p: 'We collect the audio you record, the transcripts and translations our streaming server returns, the AI conversations you have with your meetings, and your basic profile (display name, country, age, occupation, default languages). Audio segments are uploaded to Firebase Storage; transcripts and metadata are stored in Firestore under your user ID.' },
    { h: 'How we use it',
      p: 'Your data powers the live transcription, translation, summary, and AI-chat features inside the app. Audio is sent to the streaming server to produce a transcript. Transcripts are sent to the Anthropic Claude API when you generate a summary or chat with the AI. We do not sell your data to third parties.' },
    { h: 'Retention & deletion',
      p: 'You can delete a recording at any time from the meeting detail screen. Deleting a recording removes its transcript, summary, and AI chat history. Deleting your account removes your profile and all associated recordings within 30 days. Backups may persist for up to 90 days before being purged.' },
    { h: 'Your controls',
      p: 'Toggle the "No data retention" switch in settings to stop us from caching summaries and chat history. Turn off "Analytics" to opt out of aggregate usage telemetry. Use Profile → Language to change the default translation target. Use the in-app delete account flow for a complete removal.' },
    { h: 'Third-party services',
      p: 'We use Firebase (auth, storage, database, functions) operated by Google, and the Anthropic Claude API for AI features. Audio streaming uses our own server hosted on Google Cloud. These providers process your data according to their own privacy terms.' },
    { h: 'Contact',
      p: 'Questions or data requests? Reach support@sheen.ai. We respond within 5 business days.' },
  ],
  terms: [
    { h: 'Account & eligibility',
      p: 'You must be 16 or older to use Sheen AI. You are responsible for keeping your sign-in credentials secure. One person per account; sharing is not permitted.' },
    { h: 'Acceptable use',
      p: 'Record only conversations you have the legal right to capture. Many jurisdictions require all parties to consent before recording. You are solely responsible for complying with the laws that apply where you and the other speakers are located.' },
    { h: 'Plans, billing, and limits',
      p: 'Free accounts include a monthly recording allowance and a small AI-query quota. Paid tiers raise these limits. Subscriptions renew automatically until cancelled. Refunds are issued on a case-by-case basis within 14 days of purchase.' },
    { h: 'AI output',
      p: 'Transcripts, translations, summaries, and AI-chat answers are generated by machine learning models. They can be inaccurate, incomplete, or misleading. Treat them as drafts — verify anything you intend to act on.' },
    { h: 'Termination',
      p: 'We may suspend accounts that violate these terms or that put our infrastructure or other users at risk. You can stop using the service at any time and delete your account from Profile → Delete Account.' },
    { h: 'Changes',
      p: 'We may update these terms as the product evolves. Material changes will be announced inside the app at least 14 days before they take effect.' },
  ],
}
export const LegalScreen = ({ type, onBack }) => {
  const sections = type === 'privacy' ? LEGAL_COPY.privacy : LEGAL_COPY.terms
  const title    = type === 'privacy' ? 'Privacy Policy'   : 'Terms of Service'
  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <Header title={title} onBack={onBack} />
      <div style={{ padding: '0 24px', maxHeight: 680, overflowY: 'auto' }}>
        <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, padding: '16px 18px', border: `1.5px solid ${C.p4}` }}>
          <div style={{ fontSize: 11, color: C.p6, fontFamily: FONTS.body, marginBottom: 14, lineHeight: 1.5 }}>
            Last updated: May 2026. Plain-English summary — full legal text is available on request.
          </div>
          {sections.map((sec, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: FONTS.heading, fontSize: 13, fontWeight: 700, color: C.p9, marginBottom: 4 }}>
                {sec.h}
              </div>
              <p style={{ fontSize: 12, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.7, margin: 0 }}>
                {sec.p}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
