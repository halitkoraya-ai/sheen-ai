// Auth service — mirrors lib/services/auth_service.dart from the Flutter app.
// All public functions wrap Firebase Auth so the UI layer doesn't import
// firebase/* directly.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword as fbUpdatePassword,
  verifyBeforeUpdateEmail,
  deleteUser as fbDeleteUser,
} from 'firebase/auth'
import { auth, googleProvider, appleProvider } from './firebase.js'

// ── Sign up / sign in ────────────────────────────────────────────────
export const signUpWithEmail = async ({ email, password, displayName }) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) await updateProfile(cred.user, { displayName })
  await sendEmailVerification(cred.user)
  return cred
}

export const signInWithEmail = ({ email, password }) =>
  signInWithEmailAndPassword(auth, email, password)

export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider)
  } catch (e) {
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
      return null  // user dismissed the popup — not an error
    }
    throw e
  }
}

export const signInWithApple = async () => {
  try {
    return await signInWithPopup(auth, appleProvider)
  } catch (e) {
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
      return null
    }
    throw e
  }
}

// ── Password reset / profile update ──────────────────────────────────
export const sendPasswordReset = ({ email }) =>
  sendPasswordResetEmail(auth, email)

export const updateDisplayName = (displayName) => {
  if (!auth.currentUser) return Promise.resolve()
  return updateProfile(auth.currentUser, { displayName })
}

export const updateEmail = (newEmail) => {
  if (!auth.currentUser) return Promise.resolve()
  return verifyBeforeUpdateEmail(auth.currentUser, newEmail)
}

export const updatePassword = (newPassword) => {
  if (!auth.currentUser) return Promise.resolve()
  return fbUpdatePassword(auth.currentUser, newPassword)
}

export const reauthenticateWithEmail = (email, password) => {
  if (!auth.currentUser) return Promise.resolve()
  const cred = EmailAuthProvider.credential(email, password)
  return reauthenticateWithCredential(auth.currentUser, cred)
}

// ── Sign out / delete ────────────────────────────────────────────────
export const signOut = () => fbSignOut(auth)

export const deleteAccount = () => {
  if (!auth.currentUser) return Promise.resolve()
  return fbDeleteUser(auth.currentUser)
}

// ── State helpers ────────────────────────────────────────────────────
export const subscribeAuthState = (cb) => onAuthStateChanged(auth, cb)
export const currentUser = () => auth.currentUser
export const isEmailPasswordUser = () =>
  (auth.currentUser?.providerData || []).some(p => p.providerId === 'password')

// Translates common Firebase Auth error codes to friendly messages,
// matching the helper in login_screen.dart.
export const friendlyAuthError = (e) => {
  switch (e?.code) {
    case 'auth/user-not-found':     return 'No account found with that email.'
    case 'auth/wrong-password':     return 'Incorrect password. Please try again.'
    case 'auth/invalid-email':      return 'Please enter a valid email address.'
    case 'auth/user-disabled':      return 'This account has been disabled.'
    case 'auth/too-many-requests':  return 'Too many attempts. Please wait and try again.'
    case 'auth/invalid-credential': return 'Invalid email or password.'
    case 'auth/email-already-in-use': return 'An account with that email already exists.'
    case 'auth/weak-password':      return 'Password must be at least 6 characters.'
    case 'auth/network-request-failed': return 'Network error. Check your connection.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method isn\'t enabled. Please enable it in Firebase Console.'
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email under a different sign-in method.'
    case 'auth/unauthorized-domain':
      return 'This domain isn\'t authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Please allow popups and try again.'
    case 'auth/internal-error':
      return 'Authentication service error. Please try again.'
    default: return e?.message || 'An unexpected error occurred.'
  }
}
