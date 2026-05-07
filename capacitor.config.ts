import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor wraps the React web app (in `dist/`) into native iOS + Android
// shells. The same single-file Vite build serves both platforms — Capacitor
// just copies the `webDir` into the native project's bundled assets at
// `npx cap sync` time.
//
// The bundle id below is registered with App Store Connect and the Play
// Console; it must NOT change after first publish (Apple/Google rules).
// Pre-publish you're free to rename it — just update both stores' app
// records and re-run `npx cap sync` on every platform.
const config: CapacitorConfig = {
  appId:   'com.sheenai.app',
  appName: 'Sheen AI',
  webDir:  'dist',

  // Capacitor v6+ defaults to copying everything into the platform on
  // every sync; the explicit `bundledWebRuntime: false` of older guides
  // is no longer needed.

  ios: {
    // The system splash + launch screen are delegated to native config;
    // Capacitor's WebView simply hosts the bundled HTML.
    contentInset: 'always',
    // Microphone access is needed for the recording flow. The actual
    // permission prompt copy lives in ios/App/App/Info.plist
    // (NSMicrophoneUsageDescription). Capacitor doesn't auto-set this —
    // it has to be added manually after `npx cap add ios` on the Mac.
  },

  android: {
    // Mixed-content allowed only for local file:// + the bundled WebView
    // origin; the streaming server uses wss:// over TLS so this is safe.
    allowMixedContent: false,
    // Enable Chrome DevTools debugging during early dev. Flip to false
    // before shipping a release-mode AAB to Play Store.
    webContentsDebuggingEnabled: true,
  },

  // The streaming server is served over WSS, so we don't need any
  // cleartext exception. If a future emulator-only debug build needs
  // ws:// to localhost, add an `allowNavigation: ['localhost:*']` here
  // and rebuild — but never ship that to release.
  server: {
    androidScheme: 'https',
  },

  // Native plugin tuning. Defaults work for most apps; the values below
  // make the splash + status bar match the lila gradient the React app
  // already uses, so the user never sees a flash of black during launch.
  plugins: {
    SplashScreen: {
      // Show splash for ~1.5 s while React boots; then fade out so the
      // home screen render lands smoothly. Background color matches
      // C.bg from constants.js so the lila stays continuous.
      launchShowDuration:   1500,
      launchAutoHide:       true,
      launchFadeOutDuration: 200,
      backgroundColor:      '#E6DFED',
      androidSplashResourceName: 'splash',
      androidScaleType:     'CENTER_CROP',
      showSpinner:          false,
    },
    StatusBar: {
      // Edge-to-edge layout: the WebView extends behind the system status
      // bar so the lila gradient fills the entire screen. The status bar
      // becomes transparent and the OS draws its own icons over our
      // background. `style: DARK` paints those icons in dark colour so
      // they're visible against our light lila bg.
      style:                'DARK',
      backgroundColor:      '#00000000',
      overlaysWebView:      true,
    },
  },
}

export default config
