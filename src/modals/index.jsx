import { useState } from 'react'
import { C, FONTS, gradientButton, glassCard, glassInput } from '../constants.js'
import { Icon } from '../components/index.jsx'

const Overlay = ({ onClick, children }) => (
  <div
    onClick={onClick}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(20,10,40,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}
  >
    {children}
  </div>
)

const ModalBox = ({ onClick, children, style = {} }) => (
  <div
    onClick={e => e.stopPropagation()}
    style={{
      background: C.bg, borderRadius: 22, padding: '24px',
      width: 300, animation: 'slideUp .3s ease',
      boxShadow: `0 16px 48px rgba(74,32,112,.3)`,
      ...style,
    }}
  >
    {children}
  </div>
)

// ── Stop Recording Modal ─────────────────────────────────────────────
export const StopModal = ({ onConfirm, onClose }) => (
  <Overlay onClick={onClose}>
    <ModalBox style={{ textAlign: 'center', padding: '28px 24px' }}>
      <div style={{ fontSize: 14, color: C.p6, fontFamily: FONTS.body, lineHeight: 1.7, marginBottom: 20 }}>
        Recording finished. Find it in your Meeting Records.
      </div>
      <button onClick={onConfirm} style={gradientButton()}>OK</button>
    </ModalBox>
  </Overlay>
)

// ── Rename Meeting Modal ─────────────────────────────────────────────
// Rename Meeting modal — controlled input, returns the trimmed title to the
// caller via onConfirm(newTitle). The caller is responsible for the actual
// Firestore write (renameSession in services/firestore.js).
export const RenameModal = ({ initialTitle = '', onConfirm, onClose }) => {
  const [value, setValue]   = useState(initialTitle || '')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) { setError('Title cannot be empty.'); return }
    if (busy) return
    setBusy(true); setError(null)
    try {
      await onConfirm(trimmed)
    } catch (e) {
      console.error('[RenameModal] save failed', e)
      setError('Could not save. Try again.')
      setBusy(false)
    }
  }

  return (
    <Overlay onClick={busy ? undefined : onClose}>
      <ModalBox>
        <div style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: C.p9, marginBottom: 16, textAlign: 'center' }}>
          Rename Meeting
        </div>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose?.() }}
          placeholder="Meeting title"
          style={{ ...glassInput(), marginBottom: error ? 8 : 18 }}
        />
        {error && (
          <div style={{ fontSize: 12, color: '#B32B2B', marginBottom: 10, textAlign: 'center' }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={gradientButton({ flex: 1, background: 'transparent', color: C.p6, border: `1px solid ${C.p4}`, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' })}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            style={gradientButton({ flex: 1, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' })}
          >{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </ModalBox>
    </Overlay>
  )
}

// ── Country Select Modal ─────────────────────────────────────────────
export const CountryModal = ({ onConfirm, onClose }) => (
  <Overlay onClick={onClose}>
    <ModalBox>
      <div style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: C.p9, marginBottom: 14, textAlign: 'center' }}>
        Select Country
      </div>
      <div style={{ ...glassCard({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 18 }) }}>
        <span style={{ fontSize: 14, color: C.p6, fontFamily: FONTS.body }}>Please select</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke={C.p6} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose}   style={gradientButton({ flex: 1, background: 'transparent', color: C.p6, border: `1px solid ${C.p4}` })}>Cancel</button>
        <button onClick={onConfirm} style={gradientButton({ flex: 1 })}>OK</button>
      </div>
    </ModalBox>
  </Overlay>
)

// ── Age / Date Picker Modal ──────────────────────────────────────────
export const AgeModal = ({ onConfirm, onClose }) => (
  <Overlay onClick={onClose}>
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: C.bg, borderRadius: '22px 22px 0 0',
        padding: '20px 24px 36px', width: 375,
        position: 'fixed', bottom: 0,
        animation: 'slideUp .3s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: C.p9 }}>Select Date</span>
        <button
          onClick={onConfirm}
          style={{ background: C.p7, color: 'white', border: 'none', borderRadius: 8, padding: '5px 16px', fontSize: 13, cursor: 'pointer' }}
        >
          OK
        </button>
      </div>
      <div style={{ display: 'flex', textAlign: 'center' }}>
        {[
          ['2020', '2021', '2022', '2023', '2024'],
          ['06', '07', '08', '09', '10'],
          ['28', '29', '30', '31', '01'],
        ].map((col, ci) => (
          <div key={ci} style={{ flex: 1 }}>
            {col.map((v, vi) => (
              <div key={vi} style={{
                padding: '10px 0',
                fontSize: vi === 2 ? 16 : 13,
                fontWeight: vi === 2 ? 600 : 400,
                color: vi === 2 ? C.p9 : C.p6,
                fontFamily: vi === 2 ? FONTS.heading : FONTS.body,
                borderTop:    vi === 2 ? `1px solid ${C.p4}` : undefined,
                borderBottom: vi === 2 ? `1px solid ${C.p4}` : undefined,
              }}>
                {v}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </Overlay>
)

// ── Generic destructive-confirmation modal ──────────────────────────
// Reused by both account-cancellation and recording-deletion flows so the
// copy reflects what's actually being deleted. Pass `title`, `body`, and
// `confirmLabel` to specialise the message; defaults preserve the older
// account-cancellation text for backwards compatibility.
const ConfirmDeleteModal = ({
  title = 'Are you sure?',
  body  = 'Your account and all associated data will be permanently removed.',
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}) => (
  <Overlay onClick={onClose}>
    <ModalBox>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <Icon name="warning" size={36} color="#E53935" strokeWidth={1.6} />
        </div>
        <div style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 700, color: C.p9, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#FFF0F0', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#E53935' }}>
          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#E53935' }} />
          This action is permanent.
        </div>
      </div>
      <div style={{ ...glassCard({ padding: '12px 14px', marginBottom: 14, textAlign: 'center' }) }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.p7, fontFamily: FONTS.body, lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
      <button
        onClick={onConfirm}
        style={gradientButton({
          marginBottom: 8,
          background: 'linear-gradient(135deg,#E53935,#B71C1C)',
        })}
      >{confirmLabel}</button>
      <button onClick={onClose} style={gradientButton({ background: 'transparent', color: C.p6, border: `1px solid ${C.p4}` })}>Cancel</button>
    </ModalBox>
  </Overlay>
)

// ── Cancel Account Confirmation Modal ────────────────────────────────
export const CancelModal = ({ onConfirm, onClose }) => (
  <ConfirmDeleteModal
    title="Delete account?"
    body="Your account, profile, and all stored recordings will be permanently removed. This cannot be undone."
    confirmLabel="Delete account"
    onConfirm={onConfirm}
    onClose={onClose}
  />
)

// ── Delete Recording Confirmation Modal ──────────────────────────────
// Used when the user taps the trash icon on a meeting detail. Distinct copy
// so the user understands exactly what is being deleted.
export const DeleteRecordingModal = ({ title, onConfirm, onClose }) => (
  <ConfirmDeleteModal
    title="Delete this recording?"
    body={
      title
        ? `"${title}" and its transcript, summary, and AI chat history will be permanently removed.`
        : 'The transcript, summary, and AI chat history for this recording will be permanently removed.'
    }
    confirmLabel="Delete recording"
    onConfirm={onConfirm}
    onClose={onClose}
  />
)
