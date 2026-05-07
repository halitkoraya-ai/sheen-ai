# Sheen AI

React + Vite frontend, Firebase backend (Auth + Firestore + Cloud Functions),
Cloud Run streaming server (Deepgram), wrapped natively for iOS + Android via
Capacitor. One codebase, three targets (web, iOS, Android).

## Stack

- **Frontend**: React 18, Vite 5, single-file build
- **Auth + Database**: Firebase Auth, Firestore (project: `sheen-alpha`)
- **AI chat / summary**: Cloud Functions v2 + Gemini 2.5 Flash/Pro
- **Speech-to-text + translation**: Deepgram Nova-3 → Cloud Run streaming server
- **On-device audio**: IndexedDB (no cloud Storage cost)
- **Mobile shell**: Capacitor 8 (iOS + Android)

## Repo layout

```
sheen-ai/
├── src/                    React web app source
├── functions/              Cloud Functions (TypeScript) — deployed to sheen-alpha
├── server/                 Streaming server (TypeScript) — deployed to Cloud Run
├── android/                Capacitor Android project (committed; regenerate via `cap add android`)
├── ios/                    Capacitor iOS project (Mac-only; generate via `cap add ios` on Mac)
├── dist/                   Web build output (gitignored)
├── capacitor.config.ts     Capacitor app config (bundle id, web dir)
├── firebase.json           Firebase deploy config (firestore + functions + storage)
├── firestore.rules         Firestore security rules
├── firestore.indexes.json  Composite indexes
└── storage.rules           Firebase Storage rules
```

## Quick start (web)

Node.js 20+ required.

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # produce dist/index.html (single file, openable directly)
```

## Mobile build flow

The same React `dist/` is bundled into both native shells. Capacitor sync
copies `dist/` into the Android/iOS project's `assets/`.

```
npm run build:mobile   # vite build → dist/, then `cap sync` on every platform
```

### Android (Windows OK)

Prerequisites:

- [Android Studio](https://developer.android.com/studio)
- Android SDK 33+ (Android Studio installs this)
- Java 17 (Android Studio bundles a compatible JDK)

Workflow:

```bash
npm run build:mobile     # web build + sync into android/
npm run open:android     # opens Android Studio
```

Inside Android Studio: **Run ▶** for emulator/device debug, or
**Build → Generate Signed Bundle/APK → Android App Bundle (AAB)** for Play
Store upload. AAB is what Play Console wants.

### iOS (Mac only)

Prerequisites:

- macOS with Xcode 15+
- [CocoaPods](https://cocoapods.org/) (`sudo gem install cocoapods`)
- Apple Developer membership ($99/yr) for TestFlight

First-time Mac setup:

```bash
git clone https://github.com/halitkoraya-ai/sheen-ai.git
cd sheen-ai
npm install
npm run build
npm run add:ios          # creates ios/ directory + runs `pod install`
npm run open:ios         # opens Xcode
```

Inside Xcode:

1. Select the **App** target → Signing & Capabilities → set your Team + Bundle ID
2. Add `NSMicrophoneUsageDescription` to `Info.plist`
   (e.g. "Sheen AI uses your microphone to record meetings.")
3. Product → Archive
4. Window → Organizer → Distribute App → App Store Connect → Upload
5. App Store Connect → TestFlight → add internal testers

For incremental web changes after the first iOS setup:

```bash
npm run build:mobile     # rebuild web + sync into ios/
# Xcode auto-rebuilds; push Run again.
```

## Backend deploys

All Firebase / Cloud Run deploys originate from this repo.

```bash
firebase use sheen-alpha
firebase deploy --only firestore                    # rules + indexes
firebase deploy --only functions:aiChat             # Gemini-backed AI chat
firebase deploy --only storage                      # Storage rules

# Streaming server — separate gcloud command since it runs on Cloud Run.
cd server
gcloud run deploy sheen-server \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-secrets DEEPGRAM_API_KEY=DeepGram:latest \
  --memory 512Mi --cpu 1 \
  --min-instances 0 --max-instances 5 \
  --project sheen-alpha
```

## Environment / secrets

No `.env` file is committed. Server-side secrets live in Google Secret
Manager (`GEMINI_API_KEY`, `DeepGram`); the Firebase web config in
`src/services/firebase.js` is intentionally public — security comes from
Firestore Rules + Auth, not from the API key.

## Color palette

| #  | HEX       | Role                       |
|----|-----------|----------------------------|
| 1  | `#E6DFED` | Background — primary lila  |
| 2  | `#DCD9DD` | Background — secondary     |
| 3  | `#CFCDD1` | Background — shadow/depth  |
| 4  | `#D8C8E9` | Particle — faintest        |
| 5  | `#BDA2DA` | Particle — light lavender  |
| 6  | `#A28DB7` | Particle — mid-light       |
| 7  | `#8163A3` | Particle — medium purple   |
| 8  | `#613A8A` | Particle — deep purple     |
| 9  | `#4A2070` | Dark purple base / buttons |
