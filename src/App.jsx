import { useState, useEffect, useRef } from 'react'
import { PhoneFrame, Logo } from './components/index.jsx'
import {
  LoginScreen, Login2Screen, MemberInfoScreen,
  HomeScreen, SummaryScreen, SummaryEditScreen, MindMapScreen, PaymentScreen,
  RecordsScreen, RecordDetailScreen, AiChatScreen,
  ProfileScreen, PersonalInfoScreen, EditNicknameScreen,
  LangSelectScreen, AccountBindingScreen, PrivacyPermScreen,
  MemberInfo2Screen, CancelAccountScreen, LegalScreen,
  UsageScreen,
} from './screens/index.jsx'
import {
  StopModal, RenameModal, CountryModal, AgeModal, CancelModal,
  DeleteRecordingModal,
} from './modals/index.jsx'
import { useAuth } from './services/AuthContext.jsx'
import { useRecording, RecordingState } from './services/RecordingContext.jsx'
import { signOut as fbSignOut, deleteAccount as fbDeleteAccount, friendlyAuthError } from './services/auth.js'
import { renameSession, deleteSession, getSession } from './services/firestore.js'
import { deleteAudio as deleteLocalAudio, listAudio as listLocalAudio } from './services/localAudio.js'
import { C, FONTS } from './constants.js'

// ── Navigation helper ────────────────────────────────────────────────
function useNav(initial = 'login') {
  const [screen, setScreen]   = useState(initial)
  const [history, setHistory] = useState([])
  const [activeTab, setTab]   = useState('home')

  const go = (s, isTab = false) => {
    if (isTab) {
      setHistory([])
      setTab(s)
    } else {
      setHistory(h => [...h, screen])
    }
    setScreen(s)
  }

  const back = () => {
    setHistory(h => {
      const next = [...h]
      const prev = next.pop()
      if (prev) setScreen(prev)
      return next
    })
  }

  return { screen, history, activeTab, go, back }
}

// ── Splash — shown while auth state is being resolved on first paint ──
const SplashScreen = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column', height: '100%', minHeight: 700, gap: 12,
    fontFamily: FONTS.body, color: C.p7,
  }}>
    <Logo size={72} glow />
    <div style={{ fontSize: 12, opacity: 0.7 }}>Loading…</div>
  </div>
)

// ── App ──────────────────────────────────────────────────────────────
export default function App() {
  const { user, profile, loading: authLoading } = useAuth()
  const recording  = useRecording()
  const { screen, history, activeTab, go, back } = useNav('login')

  // Drive navigation off auth state:
  //  - signed out          → 'login'
  //  - signed in, no profile yet (or onboarding incomplete) → 'login2' onboarding
  //  - otherwise           → home (tab screens only)
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      if (screen !== 'login' && screen !== 'privacy' && screen !== 'agreement') {
        go('login', true)
      }
      return
    }
    // user exists — route based on onboarding status.
    if (profile && !profile.onboardingCompleted) {
      // Only stay if we're already on an onboarding-related screen; otherwise
      // (login or any other) jump to login2.
      if (screen !== 'login2' && screen !== 'memberInfo') go('login2')
      return
    }
    if (screen === 'login') {
      go('home', true)
    }
  }, [authLoading, user, profile])  // eslint-disable-line react-hooks/exhaustive-deps

  // Click ripple visual — independent of the recording state machine.
  const [rippling, setRippling]     = useState(false)

  // Content state
  const [summaryReady, setSummaryReady] = useState(false)

  // Mind map state — persists across navigation so user returns to the branch they had open.
  const [selectedMindBranch, setSelectedMindBranch] = useState(null)

  // Current session being viewed in record detail / receiving renames.
  const [currentSessionId,  setCurrentSessionId]  = useState(null)
  const [currentSessionTitle, setCurrentSessionTitle] = useState('')

  // Modal state
  const [modal, setModal] = useState(null) // 'stop' | 'rename' | 'country' | 'age' | 'cancel'

  const scrollRef = useRef(null)

  // Scroll to top on screen change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [screen])

  // Tap on the record button. Idle → start recording (delegates to context).
  const handleRecordButton = () => {
    if (recording.isActive) return
    setRippling(true)
    setTimeout(() => setRippling(false), 750)
    recording.start().catch(e => console.error('[App] start recording failed', e))
  }

  // Tap while recording → pause/resume (context manages capture + timer).
  const handlePauseToggle = () => {
    setRippling(true)
    setTimeout(() => setRippling(false), 750)
    if (recording.isPaused)        recording.resume()
    else if (recording.isRecording) recording.pause()
  }

  // Long-press while recording: stop and finalize the session.
  const handleStopRecording = () => {
    recording.stop().catch(e => console.error('[App] stop recording failed', e))
  }

  // Sign out: also tear down any in-flight recording.
  const handleLogout = async () => {
    if (recording.isActive) {
      try { await recording.stop() } catch {}
    }
    setSummaryReady(false)
    setSelectedMindBranch(null)
    try { await fbSignOut() } catch (e) { console.error('signOut failed', e) }
  }

  // Tabs are mostly free navigation; we don't auto-stop a running recording
  // when leaving the Home tab so the user can browse Records/Profile mid-record.
  const handleTabNav = (tab) => { go(tab, true) }

  // Dispatcher used by every screen's `onNavigate` prop. Bottom-nav tabs
  // are still tab-style navigations (they reset the back history so the
  // user can't accidentally back into a deep stack). Anything else
  // (Translation panel → langSelect, Profile menu → memberInfo2, etc.)
  // is a non-tab push that preserves history so back/Done returns home.
  const TAB_SCREENS = ['home', 'summary', 'records', 'profile']
  const handleNav = (s) => {
    if (TAB_SCREENS.includes(s)) handleTabNav(s)
    else go(s)
  }

  // Swipe left/right navigates between tab screens
  const TAB_ORDER = ['home', 'summary', 'records', 'profile']
  const handleSwipe = (dir) => {
    const idx = TAB_ORDER.indexOf(screen)
    if (idx === -1) return
    const next = idx + (dir === 'left' ? 1 : -1)
    if (next < 0 || next >= TAB_ORDER.length) return
    handleTabNav(TAB_ORDER[next])
  }

  // Render active screen
  const renderScreen = () => {
    switch (screen) {
      case 'login':
        return (
          <LoginScreen
            onPrivacy={()   => go('privacy')}
            onAgreement={() => go('agreement')}
          />
        )

      case 'login2':
        return (
          <Login2Screen
            onContinue={() => go('memberInfo')}   // optional plan-selection step
            onSkip={()     => go('home', true)}    // straight to home
          />
        )

      case 'memberInfo':
        return (
          <MemberInfoScreen
            onDone={() => go('home', true)}
          />
        )

      case 'home':
        return (
          <HomeScreen
            activeTab={activeTab}
            onNavigate={handleNav}
            recording={recording.isRecording || recording.isPaused}
            paused={recording.isPaused}
            timer={recording.elapsed}
            rippling={rippling}
            partial={recording.partial}
            segments={recording.segments}
            offlineMode={recording.offlineMode}
            recError={recording.error}
            onButtonClick={handleRecordButton}
            onPauseToggle={handlePauseToggle}
            onStopRecording={handleStopRecording}
          />
        )

      case 'summary':
        return (
          <SummaryScreen
            activeTab={activeTab}
            onNavigate={handleNav}
            sessionId={currentSessionId}
            hasContent={summaryReady}
            onGenerate={() => setSummaryReady(true)}
            onMindMap={() => go('mindmap')}
            onEdit={() => go('summaryEdit')}
            onPickRecording={() => handleTabNav('records')}
            onBack={history.length > 0 ? back : null}
          />
        )

      case 'summaryEdit':
        return <SummaryEditScreen onBack={back} />

      case 'mindmap':
        return (
          <MindMapScreen
            sessionId={currentSessionId}
            onBack={back}
            selectedBranch={selectedMindBranch}
            setSelectedBranch={setSelectedMindBranch}
            onOpenTopic={() => {
              setSummaryReady(true)
              go('summary')
            }}
          />
        )

      case 'payment':
        return <PaymentScreen onBack={back} />

      case 'records':
        return (
          <RecordsScreen
            activeTab={activeTab}
            onNavigate={handleNav}
            onDetail={(sessionId) => { setCurrentSessionId(sessionId); go('recordDetail') }}
          />
        )

      case 'recordDetail':
        return (
          <RecordDetailScreen
            sessionId={currentSessionId}
            onBack={back}
            onRename={async () => {
              // Pre-load current title so the modal opens populated.
              try {
                const s = await getSession(currentSessionId)
                setCurrentSessionTitle(s?.title || '')
              } catch { setCurrentSessionTitle('') }
              setModal('rename')
            }}
            onDelete={() => setModal('deleteSession')}
            onAiChat={() => go('aiChat')}
            // For Free users the AI chat button is rendered as a locked
            // teaser; clicking it jumps to the Membership screen so the
            // user can see what they'd unlock by upgrading.
            onUpgrade={() => go('memberInfo2')}
            // currentSessionId is already set when we navigated to detail; the
            // Summary screen will use it to load/generate the summary.
            onGenerateSummary={() => { go('summary', true); setSummaryReady(true) }}
          />
        )

      case 'aiChat':
        return (
          <AiChatScreen
            sessionId={currentSessionId}
            onBack={back}
            // Future: when audio playback is wired, scrub to this time.
            onJumpToTime={(s) => console.log('[App] jump to', s, 'sec (playback TBD)')}
          />
        )

      case 'profile':
        return (
          <ProfileScreen
            activeTab={activeTab}
            onNavigate={handleNav}
            onPersonalInfo={() => go('personalInfo')}
            onLogout={handleLogout}
          />
        )

      case 'personalInfo':
        return (
          <PersonalInfoScreen
            onBack={back}
            onLogout={handleLogout}
          />
        )

      case 'editNickname':
        return <EditNicknameScreen onBack={back} />

      case 'langSelect':
        return <LangSelectScreen onBack={back} />

      case 'accountBinding':
        return <AccountBindingScreen onBack={back} />

      case 'privacyPerm':
        return (
          <PrivacyPermScreen
            onBack={back}
            onPrivacy={() => go('privacy')}
            onAgreement={() => go('agreement')}
          />
        )

      case 'memberInfo2':
        return <MemberInfo2Screen onBack={back} onUpgrade={() => go('payment')} />

      case 'usage':
        return <UsageScreen onBack={back} onUpgrade={() => go('memberInfo2')} />

      case 'cancelAccount':
        return <CancelAccountScreen onBack={back} onCancel={() => setModal('cancel')} />

      case 'privacy':
      case 'agreement':
        return <LegalScreen type={screen} onBack={back} />

      default:
        return <div style={{ padding: 24, textAlign: 'center' }}>···</div>
    }
  }

  // Account deletion. The Sheen Flutter app calls a Cloud Function
  // (`deleteUserData`) that wipes Firestore + Storage with the admin SDK,
  // then deletes the auth user. We don't have that function deployed for the
  // web client yet, so we attempt a direct auth.deleteAccount() call. It can
  // fail with `auth/requires-recent-login`; in that case the user must sign
  // out and back in, then retry.
  const handleCancelConfirm = async () => {
    setModal(null)
    // If a recording is in flight, tear it down silently before nuking the
    // account so we don't leave an orphan WebSocket / capture pipeline alive
    // after auth is gone. `reset()` skips the finalize-to-Firestore step
    // (the account is about to disappear anyway).
    try { if (recording.isActive) await recording.reset() } catch (_) {}
    setSummaryReady(false)
    try {
      await fbDeleteAccount()
    } catch (e) {
      console.error('[App] deleteAccount failed', e)
      // Surface the message via alert for now — a proper flow would re-auth.
      alert(`Could not delete account: ${friendlyAuthError(e)}\nPlease sign in again and retry.`)
    }
    // Wipe every locally-cached recording so the next user of this device
    // doesn't inherit our audio. Best-effort — failures are logged but
    // don't block the sign-out.
    try {
      const ids = await listLocalAudio()
      await Promise.all(ids.map(id => deleteLocalAudio(id)))
    } catch (e) {
      console.warn('[App] local audio wipe failed', e?.message)
    }
    // Auth-effect routes to login automatically once user becomes null.
    try { await fbSignOut() } catch (_) {}
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <PhoneFrame scrollRef={scrollRef} onSwipe={handleSwipe}>
        {authLoading ? <SplashScreen /> : renderScreen()}
      </PhoneFrame>

      {/* Modals */}
      {modal === 'stop' && (
        <StopModal
          onConfirm={() => {
            setModal(null)
            // Finalize through the recording context — flushes the buffer,
            // closes the WebSocket, and writes the session doc to Firestore
            // so it shows up in Records. Failure is logged but we still
            // navigate so the user isn't stranded on a modal.
            recording.stop().catch(e => console.error('[App] stop recording failed', e))
            go('records', true)
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'rename' && (
        <RenameModal
          initialTitle={currentSessionTitle}
          onConfirm={async (newTitle) => {
            if (currentSessionId) await renameSession(currentSessionId, newTitle)
            setCurrentSessionTitle(newTitle)
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'deleteSession' && (
        <DeleteRecordingModal
          title={currentSessionTitle}
          onConfirm={async () => {
            if (currentSessionId) {
              // Wipe the on-device audio first — if the Firestore delete
              // fails we'd otherwise orphan a multi-MB blob locally with no
              // session doc to point back to it.
              try { await deleteLocalAudio(currentSessionId) }
              catch (e) { console.warn('[App] deleteLocalAudio failed', e?.message) }
              try { await deleteSession(currentSessionId) }
              catch (e) { console.error('[App] deleteSession failed', e) }
            }
            setCurrentSessionId(null)
            setCurrentSessionTitle('')
            setModal(null)
            back()
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'country' && <CountryModal onConfirm={() => setModal(null)} onClose={() => setModal(null)} />}
      {modal === 'age'     && <AgeModal     onConfirm={() => setModal(null)} onClose={() => setModal(null)} />}
      {modal === 'cancel'  && <CancelModal  onConfirm={handleCancelConfirm}  onClose={() => setModal(null)} />}
    </div>
  )
}
