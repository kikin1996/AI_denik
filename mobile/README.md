# DayStory Mobile

Expo/React Native app that turns the daily voice diary into a real in-app
VoIP call: the phone rings via CallKit (like a WhatsApp call), the user talks
to an OpenAI Realtime voice agent, and the finished transcript is analyzed
and saved into the **same Supabase project and `journal_entries` table** as
the [web app](../README.md) — sign in from either and see the same diary.

## Status: JS/TS layer complete, one native step outstanding

Everything that can be built and verified without Xcode/macOS is done:
navigation, auth, Supabase data, the realtime voice session, CallKit
wiring, and all three backend endpoints (in the web app's Next.js API).
`npx tsc --noEmit`, `npx expo lint`, and `npx expo-doctor` all pass.

**What's not verified:** the actual native iOS build. This machine has no
Mac, and `expo prebuild -p ios` only runs on macOS/Linux, so:

- The one AppDelegate edit that PushKit needs is documented, not applied —
  see [`docs/ios-native-setup.md`](./docs/ios-native-setup.md). Do this once, on a Mac,
  after your first prebuild.
- `expo-doctor` flags `react-native-callkeep`, `react-native-webrtc`, and
  `react-native-voip-push-notification` as **untested on React Native's New
  Architecture**, which Expo SDK 57 requires (it can no longer be disabled).
  These libraries may still need patches or a `withNewArchOnly`-style
  workaround — this is a real risk to budget time for, not just a lint
  nag. Check each library's GitHub issues for New Architecture status before
  relying on this in production.
- Android's call-wake path (`react-native-callkeep` ConnectionService +
  high-priority FCM) is wired in the JS layer but the FCM-sending half of
  `/api/cron/trigger-voip-calls` isn't implemented — it currently only
  sends iOS VoIP pushes. Android needs a Firebase service-account credential
  this project doesn't have.

## Setup

```bash
cd mobile
cp .env.example .env   # fill in the anon key (see below)
npm install
npx expo prebuild      # macOS/Linux only — generates ios/ and android/
# then follow docs/ios-native-setup.md once, on macOS, before your first iOS build
npx expo run:ios       # or: npx eas build --profile development --platform ios
```

You cannot use Expo Go — this app has native modules (CallKit, WebRTC,
PushKit), so every run is a custom development build.

### Backend env vars (set in the **web app**, not here)

The mobile app's backend endpoints live in the web app's Next.js API
(`/api/realtime/session`, `/api/mobile/register-push-token`,
`/api/mobile/call-complete`, `/api/cron/trigger-voip-calls`). Add to the web
app's `.env.local` / Vercel project:

```
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_AUTH_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_BUNDLE_ID=cz.daystory.app
APNS_ENVIRONMENT=production
```

Get the APNs key from Apple Developer → Certificates, Identifiers & Profiles
→ Keys → create one with "Apple Push Notifications service (APNs)" enabled.

Schedule `/api/cron/trigger-voip-calls` hourly the same way you schedule
`/api/cron/trigger-calls` (see the web app's README) — same `CRON_SECRET`.

### Database

Run [`../supabase/mobile-schema.sql`](../supabase/mobile-schema.sql) once,
after the web app's `schema.sql`. It adds one table, `push_tokens`.

## How a call happens

1. `/api/cron/trigger-voip-calls` runs hourly, finds users due this hour
   (same `preferred_call_time`/timezone logic as the web app's Vapi cron),
   and sends each an APNs VoIP push (`src/lib/apns.ts` in the web app).
2. iOS wakes the app via PushKit → the native AppDelegate patch reports the
   call to CallKit → the OS shows the native full-screen incoming-call UI.
3. User answers → CallKit's `answerCall` event fires (`src/app/_layout.tsx`)
   → the app mints an OpenAI Realtime ephemeral token
   (`/api/realtime/session`) and opens a WebRTC session
   (`src/services/realtimeVoice.ts`) using the same Czech agent persona as
   the web app's Vapi assistant (`src/config/agentPrompt.ts`).
4. User hangs up (`src/app/call/in-call.tsx`) → the collected transcript
   turns are POSTed to `/api/mobile/call-complete`, which reuses the web
   app's `analyzeJournalTranscript()` and writes the same `journal_entries`
   row shape the Vapi webhook writes.

## Structure

```
src/
  app/               # Expo Router routes — file-based
    (auth)/          # login, verify (email OTP — code, not magic link)
    (app)/           # index (timeline), entry/[id], settings
    call/in-call.tsx # active-call screen (duration, mute, end)
    _layout.tsx       # auth gate (Stack.Protected) + CallKeep listeners
  services/
    supabase.ts       # same project as the web app
    callkeep.ts        # CallKit setup/events
    voipPush.ts         # PushKit token registration (iOS) / FCM (Android)
    realtimeVoice.ts     # OpenAI Realtime WebRTC session
    activeCall.ts          # singleton bridging the CallKit event -> screen
  hooks/useAuth.tsx    # session + public.users profile, email-OTP sign-in
  config/
    theme.ts            # ported from the web app's design tokens
    agentPrompt.ts        # same Czech persona as vapi-agent-prompt.ts
    env.ts                  # EXPO_PUBLIC_* env validation
  types/database.ts        # hand-written subset of the shared schema
```
