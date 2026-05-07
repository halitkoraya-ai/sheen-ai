# iOS — TestFlight setup (Mac only)

Step-by-step recipe for getting `sheen-ai` onto a real iPhone via TestFlight.
Run these commands on a Mac with Xcode 15+ installed.

## Prerequisites (one-time, do this first)

1. **Xcode**: install from Mac App Store (~30 min, ~10 GB)
2. **Command Line Tools**: `xcode-select --install`
3. **CocoaPods**: `sudo gem install cocoapods`
4. **Node 20+**: `brew install node` (or use [nvm](https://github.com/nvm-sh/nvm))
5. **Apple Developer membership**: $99/yr at [developer.apple.com](https://developer.apple.com/programs/enroll/)
6. **Sign in with Apple ID in Xcode**: Xcode → Settings → Accounts → "+" → add your Apple ID

## Clone the repo

```bash
cd ~/Desktop
git clone https://github.com/halitkoraya-ai/sheen-ai.git
cd sheen-ai
npm install
```

## First-time iOS scaffolding

```bash
npm run build              # produce dist/ (Capacitor copies this in)
npm run add:ios            # generates ios/ project + runs `pod install`
npm run gen:assets         # produces icon + splash for both platforms
npm run sync:ios           # pushes web assets + plugins into ios/
npm run open:ios           # opens Xcode
```

After `npm run add:ios`, the `ios/` folder is committed to the repo on
the next `git push`, so subsequent Mac builds skip step 2.

## One-time Xcode config

In Xcode after `npm run open:ios`:

### 1. Add the microphone permission string to Info.plist

Click on `App/App/Info.plist` in the file tree → click "+" next to any
row → **Privacy - Microphone Usage Description** → paste:

> Sheen AI uses the microphone to record meetings and produce live transcripts on this device.

(This is the message iOS shows when first asking for mic permission.
Apple rejects apps that don't include it.)

### 2. Set Bundle Identifier + Team

Click on the `App` project (top of file tree) → Signing & Capabilities tab:

- **Team**: pick your Apple Developer team
- **Bundle Identifier**: `com.sheenai.app` (must match capacitor.config.ts)
- **Signing Certificate**: leave on "Automatic"

### 3. Set deployment target

Click `App` → General tab:

- **Minimum Deployments → iOS**: 14.0 or later (matches Capacitor's floor)

### 4. Set version + build number

Same General tab:

- **Version**: `1.0.0` (semver, shown to users)
- **Build**: `1` (increment on every TestFlight upload)

## Build + upload to TestFlight

```
Product → Archive
```

Wait ~3-5 minutes. When the Organizer window opens:

1. Select the new archive
2. **Distribute App** → "App Store Connect" → "Upload" → "Next" through defaults
3. Wait ~5-10 min for the upload + Apple's processing

## App Store Connect setup

In parallel with the upload, set up the app record:

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. **My Apps → "+"** → **New App**
3. Fill in:
   - Platform: iOS
   - Name: `Sheen AI`
   - Primary Language: English (or Turkish)
   - Bundle ID: `com.sheenai.app` (must already be registered in Apple Developer Portal)
   - SKU: any unique string, e.g. `sheen-ai-001`
   - User Access: Full Access
4. After upload finishes, the build appears under the app's **TestFlight** tab
5. Add **Internal Testers** (App Store Connect users on your team — instant access)
6. Or **External Testers** (any Apple ID — needs short Apple review, ~24h)

Testers download **TestFlight** from the App Store, then accept the
invite email — the app appears in TestFlight ready to install.

## Incremental updates

After the first push:

```bash
git pull                  # latest web changes
npm install               # any new packages
npm run build:mobile      # rebuild web + sync
# Bump build number in Xcode (e.g. 1 → 2)
# Product → Archive → Distribute → upload
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pod install` fails with "No such module 'Capacitor'" | `cd ios/App && pod install` from the Mac terminal |
| Xcode "Signing certificate not found" | Xcode → Settings → Accounts → click "Download Manual Profiles" |
| Mic permission denied at runtime | Check Info.plist `NSMicrophoneUsageDescription` is set; reinstall app |
| Live transcript does nothing | Cloud Run server URL in `src/services/websocket.js` must match what's deployed; rebuild + sync after edit |
| White screen on launch | Run `npm run build:mobile` again; the WebView loads from a stale `dist/` if build isn't synced |

## Native sign-in (Google + Apple) — defer

Currently auth uses Firebase popup-based flow which works on web but is
flaky inside iOS WebView. Before public release we'll swap to:

- `@capacitor-firebase/authentication` for Google + Apple sign-in
- Configure `GoogleService-Info.plist` (Firebase Console → iOS app → download)
- Add `Sign in with Apple` capability in Xcode
- Update `src/services/auth.js` to detect Capacitor platform and route to
  the native plugin instead of Firebase popup

For internal TestFlight testing email/password still works fine, so this
can wait until we're ready for App Store review.
