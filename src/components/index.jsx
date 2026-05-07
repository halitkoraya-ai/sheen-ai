import { useRef } from 'react'
import { C, FONTS } from '../constants.js'
import logoUrl from '../logo.png'

// ── Sheen AI Logo ────────────────────────────────────────────────────
export const Logo = ({ size = 80, glow = false }) => (
  <img
    src={logoUrl}
    alt="Sheen AI"
    width={size}
    height={size}
    style={{
      display: 'block',
      objectFit: 'contain',
      ...(glow ? { animation: 'glow 3s ease-in-out infinite' } : {}),
    }}
  />
)

// ── Status Bar ───────────────────────────────────────────────────────
export const StatusBar = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 24px 0', fontSize: 12, fontWeight: 600, color: C.p9, fontFamily: FONTS.body }}>
    <span>9:41</span>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {/* Signal */}
      <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
        <rect x="0"  y="4"   width="2.5" height="7"    rx="1" fill={C.p9} />
        <rect x="4"  y="2.5" width="2.5" height="8.5"  rx="1" fill={C.p9} />
        <rect x="8"  y="0.5" width="2.5" height="10.5" rx="1" fill={C.p9} />
        <rect x="12" y="0"   width="3"   height="11"   rx="1" fill={C.p4} />
      </svg>
      {/* Battery */}
      <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
        <rect x=".5" y=".5" width="20" height="11" rx="3" stroke={C.p9} strokeOpacity=".4" />
        <rect x="2"  y="2"  width="15" height="8"  rx="1.5" fill={C.p9} />
        <path d="M22 4V8C23 7.5 23 4.5 22 4Z" fill={C.p9} fillOpacity=".4" />
      </svg>
    </div>
  </div>
)

// ── Screen Header with back button ───────────────────────────────────
export const Header = ({ title, onBack, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 8px' }}>
    <button
      onClick={onBack}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M15 18L9 12L15 6" stroke={C.p9} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    <span style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 600, color: C.p9 }}>{title}</span>
    <div style={{ width: 28, display: 'flex', justifyContent: 'flex-end' }}>{right || null}</div>
  </div>
)

// ── Bottom Navigation Bar ────────────────────────────────────────────
const NAV_TABS = [
  { id: 'home',    label: 'Home',    path: 'M3 12L12 4L21 12V21H15V15H9V21H3V12Z' },
  { id: 'summary', label: 'Summary', path: 'M4 3h16v2H4zm0 5h16v2H4zm0 5h10v2H4z' },
  { id: 'records', label: 'Records', path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm.5 14H11V7h1.5v9z' },
  { id: 'profile', label: 'Profile', path: 'M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z' },
]

export const BottomNav = ({ active, onNavigate }) => (
  <div style={{
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'rgba(230,223,237,0.97)',
    borderTop: `1px solid ${C.p4}`,
    display: 'flex', padding: '8px 0 18px', zIndex: 10,
  }}>
    {NAV_TABS.map(tab => (
      <button
        key={tab.id}
        onClick={() => onNavigate(tab.id)}
        style={{
          flex: 1, background: 'none', border: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 3, cursor: 'pointer',
          color: active === tab.id ? C.p9 : C.p6, padding: '2px 0',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d={tab.path}
            stroke={active === tab.id ? C.p9 : C.p6}
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            fill={active === tab.id ? C.p4 + '80' : 'none'}
          />
        </svg>
        <span style={{ fontSize: 9, fontWeight: active === tab.id ? 600 : 400, fontFamily: FONTS.body }}>
          {tab.label}
        </span>
      </button>
    ))}
  </div>
)

// ── Waveform (recording active) ──────────────────────────────────────
export const Waveform = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 44 }}>
    {Array.from({ length: 22 }, (_, i) => (
      <div
        key={i}
        style={{
          width: 3, background: C.p7, borderRadius: 2,
          height: `${16 + Math.abs(Math.sin(i * .7)) * 22}px`,
          transformOrigin: 'bottom',
          animation: `wave ${.7 + i * .04}s ${i * .035}s ease-in-out infinite`,
        }}
      />
    ))}
  </div>
)

// ── Checkbox with checkmark ──────────────────────────────────────────
export const CheckIcon = () => (
  <div style={{
    width: 20, height: 20, borderRadius: 6,
    border: `1.5px solid ${C.p5}`,
    background: 'rgba(255,255,255,.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, cursor: 'pointer',
  }}>
    <svg width="11" height="9" viewBox="0 0 11 9">
      <path d="M1 4.5L4 7.5L10 1" stroke={C.p9} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
)

// ── Generic flat icon set (replaces emoji throughout the app) ────────
// All icons render at 24x24 viewBox by default and inherit the supplied
// `color`. Stroke width is tuned so the icons feel coherent at the
// 16–24 px sizes we use across the UI.
const iconBaseStyle = (size) => ({
  display: 'block',
  flexShrink: 0,
  width: size,
  height: size,
})

export const Icon = ({ name, size = 18, color = C.p9, strokeWidth = 1.7, style }) => {
  const s = { ...iconBaseStyle(size), ...style }
  const stroke = color
  const sw = strokeWidth
  switch (name) {
    case 'crown':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
          <path d="M5 19h14" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'link':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth={sw} />
          <path d="M3 12h18M12 3c2.7 3 2.7 15 0 18M12 3c-2.7 3-2.7 15 0 18" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'lock':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" stroke={stroke} strokeWidth={sw} />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'warning':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M12 3.5L21.5 20H2.5L12 3.5z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M12 10v5" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <circle cx="12" cy="17.5" r="1" fill={stroke} />
        </svg>
      )
    case 'sparkle':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <path d="M5.5 5.5l3 3M15.5 15.5l3 3M5.5 18.5l3-3M15.5 8.5l3-3" stroke={stroke} strokeWidth={sw * .6} strokeLinecap="round" opacity=".55" />
        </svg>
      )
    case 'rocket':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M14 4c4 0 6 2 6 6-2 2-4 4-7 5l-4-4c1-3 3-5 5-7z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M9 11l-4 1-1 4 4-1 4 4 1-4-4-4z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <circle cx="15" cy="9" r="1.4" stroke={stroke} strokeWidth={sw} />
        </svg>
      )
    case 'folder':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      )
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 4v-4H6a2 2 0 0 1-2-2V6z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <rect x="5" y="4.5" width="14" height="16" rx="2" stroke={stroke} strokeWidth={sw} />
          <rect x="9" y="2.5" width="6" height="4" rx="1" stroke={stroke} strokeWidth={sw} />
          <path d="M8 11h8M8 15h6" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'discussion':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M3 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3 3v-3H5a2 2 0 0 1-2-2V6z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M9 10h12a2 2 0 0 1 0 4h-1v3l-3-3h-4" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" opacity=".55" />
        </svg>
      )
    case 'target':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <circle cx="12" cy="12" r="8.5" stroke={stroke} strokeWidth={sw} />
          <circle cx="12" cy="12" r="4.5" stroke={stroke} strokeWidth={sw} />
          <circle cx="12" cy="12" r="1.4" fill={stroke} />
        </svg>
      )
    case 'map':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M9 4v14M15 6v14" stroke={stroke} strokeWidth={sw} />
        </svg>
      )
    case 'tree':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <circle cx="6" cy="6" r="2.2" stroke={stroke} strokeWidth={sw} />
          <circle cx="6" cy="18" r="2.2" stroke={stroke} strokeWidth={sw} />
          <circle cx="18" cy="12" r="2.2" stroke={stroke} strokeWidth={sw} />
          <path d="M8 6h4a4 4 0 0 1 4 4v0M8 18h4a4 4 0 0 0 4-4v0" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'user':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <circle cx="12" cy="8" r="4" stroke={stroke} strokeWidth={sw} />
          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      )
    case 'star':
      return (
        <svg viewBox="0 0 24 24" fill={stroke} style={s}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6L3 9.5l6.1-.9L12 3z" />
        </svg>
      )
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" fill="none" style={s}>
          <path d="M4 20h16" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <rect x="5"  y="13" width="3" height="6"  rx="1" stroke={stroke} strokeWidth={sw} />
          <rect x="10.5" y="9"  width="3" height="10" rx="1" stroke={stroke} strokeWidth={sw} />
          <rect x="16" y="5"  width="3" height="14" rx="1" stroke={stroke} strokeWidth={sw} />
        </svg>
      )
    default:
      return null
  }
}

// ── Subscription Plan Card ───────────────────────────────────────────
export const PlanCard = ({ plan, onPress, subscribed = false }) => {
  const { title, price, iconName, features, dark } = plan
  return (
    <div
      onClick={onPress}
      style={{
        background: dark ? C.p9 : 'rgba(255,255,255,0.72)',
        borderRadius: 16, padding: 16, marginBottom: 12, cursor: 'pointer',
        border: `1.5px solid ${dark ? C.p8 : subscribed ? C.p7 : C.p4}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: dark ? '#fff' : C.p9 }}>
          {title}
          {subscribed && (
            <span style={{ fontSize: 11, background: C.p9, color: 'white', borderRadius: 6, padding: '2px 8px', marginLeft: 6 }}>
              Active
            </span>
          )}
        </span>
        {iconName && (
          <Icon
            name={iconName}
            size={18}
            color={dark ? '#fff' : C.p9}
          />
        )}
      </div>
      {features.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            background: dark ? C.p5 : C.p7,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="8" height="6" viewBox="0 0 8 6">
              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,.8)' : C.p6, fontFamily: FONTS.body }}>{f}</span>
        </div>
      ))}
      <div style={{
        marginTop: 12, padding: '10px',
        background: dark
          ? `linear-gradient(135deg, ${C.p8}, ${C.p9})`
          : `linear-gradient(135deg, ${C.p5}, ${C.p7})`,
        borderRadius: 10, textAlign: 'center',
        color: 'white', fontSize: 14, fontWeight: 600, fontFamily: FONTS.heading,
      }}>
        {subscribed ? 'Activated' : price}
      </div>
    </div>
  )
}

// ── Phone Frame wrapper ──────────────────────────────────────────────
// Detect whether the app is running inside a Capacitor native shell
// (iOS / Android) versus a regular browser. On native we render full-bleed
// — no fake notch, no fake status bar, no rounded mockup — and let the OS
// chrome handle the device frame. On the web we keep the iPhone mockup
// look so the desktop preview reads as a polished prototype.
const isCapacitorNative = (() => {
  try {
    if (typeof window === 'undefined') return false
    const cap = window.Capacitor
    if (!cap) return false
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform()
    return cap.platform === 'ios' || cap.platform === 'android'
  } catch { return false }
})()

export const PhoneFrame = ({ children, scrollRef, onSwipe }) => {
  const swipeRef = useRef(null)

  const onPointerDown = (e) => {
    swipeRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e) => {
    const start = swipeRef.current
    swipeRef.current = null
    if (!start || !onSwipe) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      onSwipe(dx < 0 ? 'left' : 'right')
    }
  }
  const onPointerCancel = () => { swipeRef.current = null }

  // ── Native shell: full-bleed, real OS status bar, no mockup chrome ──
  // Outer container fills the entire viewport (any device, any orientation).
  // Inner container caps at 480 px and centers horizontally so the mobile-
  // sized layout doesn't stretch awkwardly on tablets / iPads / landscape
  // phones. `dvh` (dynamic viewport height) keeps the layout correct when
  // iOS Safari's toolbars expand or collapse during scroll.
  if (isCapacitorNative) {
    return (
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          // Edge-to-edge: no padding so the lila gradient fills the entire
          // viewport including under the system status bar + home
          // indicator. Capacitor's StatusBar plugin is configured with
          // overlaysWebView:true so the OS draws its system icons over
          // our background.
          width: '100vw',
          minHeight: '100dvh',
          background: `linear-gradient(180deg, ${C.bg} 0%, ${C.p4} 100%)`,
          fontFamily: FONTS.body,
          touchAction: 'pan-y',
          overflow: 'hidden',
          // Center the mobile-sized React tree on tablets / iPads.
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          ref={scrollRef}
          style={{
            width: '100%',
            maxWidth: 480,
            minHeight: '100dvh',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            position: 'relative',
            // Inset content so the system status bar (top) and home
            // indicator (bottom) never overlap React UI, while the
            // gradient bg above keeps painting edge-to-edge.
            paddingTop:    'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {children}
        </div>
      </div>
    )
  }

  // ── Web preview: keep the polished iPhone mockup ───────────────────
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        width: 375, minHeight: 812,
        background: `linear-gradient(180deg, ${C.bg} 0%, ${C.p4} 100%)`,
        borderRadius: 48,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: `0 0 0 10px ${C.bg3}, 0 32px 64px rgba(74,32,112,.35)`,
        fontFamily: FONTS.body,
        touchAction: 'pan-y',
      }}
    >
      {/* Notch */}
      <div style={{ width: 120, height: 34, background: '#1a1a1a', borderRadius: '0 0 22px 22px', margin: '0 auto' }} />
      <StatusBar />
      <div ref={scrollRef} style={{ maxHeight: 756, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
