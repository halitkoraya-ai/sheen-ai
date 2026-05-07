import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './services/AuthContext.jsx'
import { RecordingProvider } from './services/RecordingContext.jsx'
import { IS_NATIVE, C } from './constants.js'
import './styles.css'

// Tell stylesheet about the runtime environment. The body styles in
// styles.css have an `is-native` branch that flips off the iPhone-mockup
// centring used by the desktop preview, so the React tree fills the
// device viewport edge-to-edge instead of floating in a 480px column.
if (IS_NATIVE && typeof document !== 'undefined') {
  document.body.classList.add('is-native')
}

// Native shell setup — apply StatusBar tuning at runtime. The values in
// capacitor.config.ts only seed initial native setup; visual changes
// (overlay mode, icon colour, background tint) need an explicit JS call
// after the WebView has booted, otherwise Android falls back to its
// default white bars.
if (IS_NATIVE) {
  ;(async () => {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      // The plugin's `setOverlaysWebView({ overlay: true })` makes the
      // system status bar transparent and lets the WebView paint behind
      // it. Combined with our gradient that's enough to match the brand
      // bg edge-to-edge.
      await StatusBar.setOverlaysWebView({ overlay: true })
      // Dark icons over the light lila bg so 9:41 / signal / battery
      // stay readable. Style.Dark = "dark content / icons" — yes, the
      // naming is confusing.
      await StatusBar.setStyle({ style: Style.Dark })
      // Belt-and-braces: even in overlay mode, set a transparent tint
      // so older Android versions don't paint a stale white background.
      await StatusBar.setBackgroundColor({ color: '#00000000' })
    } catch (e) {
      // Plugin missing or platform doesn't support — log + carry on.
      console.warn('[StatusBar] runtime setup skipped:', e?.message || e)
    }

    // Also run @capacitor/splash-screen.hide once React renders so the
    // launch image fades out predictably even if the auto-hide config
    // fails on certain Android OEM theming.
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen')
      // Defer slightly so the React tree has painted at least once.
      setTimeout(() => SplashScreen.hide().catch(() => {}), 1200)
    } catch {}
  })()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RecordingProvider>
        <App />
      </RecordingProvider>
    </AuthProvider>
  </React.StrictMode>
)
