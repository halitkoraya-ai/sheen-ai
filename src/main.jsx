import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './services/AuthContext.jsx'
import { RecordingProvider } from './services/RecordingContext.jsx'
import { IS_NATIVE } from './constants.js'
import './styles.css'

// Tell stylesheet about the runtime environment. The body styles in
// styles.css have an `is-native` branch that flips off the iPhone-mockup
// centring used by the desktop preview, so the React tree fills the
// device viewport edge-to-edge instead of floating in a 480px column.
if (IS_NATIVE && typeof document !== 'undefined') {
  document.body.classList.add('is-native')
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
