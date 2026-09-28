# iOS native setup — one manual step

Everything except one piece is automated by the Expo config plugins in
`app.json` (`@config-plugins/react-native-callkeep`,
`@config-plugins/react-native-webrtc`, `expo-notifications`) when you run
`expo prebuild` or `eas build`. Those plugins handle `UIBackgroundModes`,
Info.plist permission strings, and framework linking.

**What they do NOT do:** wire PushKit's `PKPushRegistryDelegate` into the
generated Swift `AppDelegate.swift`. No maintained Expo config plugin for
`react-native-voip-push-notification` exists (the only ones on npm are
hand-forked for a single unrelated app and hard-code that app's file paths —
unsafe to reuse here). This needs a one-time manual edit after your first
`npx expo prebuild -p ios`, done from macOS with Xcode. This repo was built
without access to a Mac, so this step is documented but not verified by a
real build — check it against whatever `AppDelegate.swift` actually looks
like for your installed Expo SDK version before shipping.

## Steps

1. `cd mobile && npx expo prebuild -p ios` (macOS/Linux only — this fails on
   Windows, which is why it isn't run automatically here).
2. Open `ios/DayStory/AppDelegate.swift`.
3. Add near the top, after the existing `import` lines:

   ```swift
   import PushKit
   ```

4. Make `AppDelegate` conform to `PKPushRegistryDelegate` (add it to the
   class's protocol list), and add these methods inside the class body:

   ```swift
   private let voipRegistry = PKPushRegistry(queue: .main)

   func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
     RNVoipPushNotificationManager.didUpdate(credentials, forType: type.rawValue)
   }

   func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
     // No action needed — the backend simply stops using the stale token
     // once a fresh `register` event overwrites push_tokens.voip_token.
   }

   func pushRegistry(
     _ registry: PKPushRegistry,
     didReceiveIncomingPushWith payload: PKPushPayload,
     for type: PKPushType,
     completion: @escaping () -> Void
   ) {
     let uuid = (payload.dictionaryPayload["uuid"] as? String) ?? UUID().uuidString
     let callerName = (payload.dictionaryPayload["callerName"] as? String) ?? "DayStory"

     RNVoipPushNotificationManager.addCompletionHandler(uuid, completionHandler: completion)
     RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)

     // Required by Apple: report to CallKit before this method returns, or
     // iOS may kill the app / stop delivering future VoIP pushes.
     RNCallKeep.reportNewIncomingCall(
       uuid,
       handle: "daystory",
       handleType: "generic",
       hasVideo: false,
       localizedCallerName: callerName,
       supportsHolding: true,
       supportsDTMF: true,
       supportsGrouping: true,
       supportsUngrouping: true,
       fromPushKit: true,
       payload: nil,
       withCompletionHandler: completion
     )
   }
   ```

5. Register the push registry in `application(_:didFinishLaunchingWithOptions:)`,
   near the top of the method (before the RN factory/root view setup):

   ```swift
   voipRegistry.delegate = self
   voipRegistry.desiredPushTypes = [.voIP]
   ```

6. Create (or edit) the Swift bridging header — Xcode names it
   `<ProjectName>-Bridging-Header.h` — and add:

   ```objc
   #import "RNCallKeep.h"
   #import "RNVoipPushNotificationManager.h"
   ```

   If Xcode doesn't already have a bridging header configured, add one via
   Build Settings → Swift Compiler - General → Objective-C Bridging Header.

7. Rebuild (`npx expo run:ios` or `eas build -p ios --profile development`).

## Why this can't be automated safely here

`expo prebuild` (and therefore any config plugin) only runs on macOS/Linux —
Windows is explicitly unsupported for the iOS platform, so this environment
could install and configure every JS-level piece but never generate or
inspect the real `ios/` project to verify a plugin-based AppDelegate patch
would apply cleanly. A regex/string-based Swift-code injector that's never
been run against the actual file it targets is worse than an honest manual
step — see the rejected `expo-voip-push-notification` fork in git history
of this investigation for what that looks like when it goes wrong (it
hard-codes bridging-header paths for someone else's app, named "Bale").
