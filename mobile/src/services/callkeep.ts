import { Platform } from "react-native";
import RNCallKeep from "react-native-callkeep";

/**
 * One-time CallKit / ConnectionService setup. Call this once, as early as
 * possible (root layout mount) — CallKit must be configured before any
 * `reportNewIncomingCall` can be shown.
 *
 * NOTE: on iOS this alone does NOT make incoming VoIP pushes ring the phone.
 * The native AppDelegate must also implement PKPushRegistryDelegate and call
 * RNCallKeep.reportNewIncomingCall from didReceiveIncomingPushWithPayload —
 * that part is documented as a manual step in mobile/ios/NATIVE_SETUP.md
 * because it requires hand-editing the generated Swift AppDelegate after
 * `expo prebuild`, which this environment can't build/verify without a Mac.
 */
export async function setupCallKeep(): Promise<void> {
  try {
    await RNCallKeep.setup({
      ios: {
        appName: "DayStory",
        supportsVideo: false,
        maximumCallGroups: "1",
        maximumCallsPerCallGroup: "1",
      },
      android: {
        alertTitle: "Oprávnění pro telefonní hovory",
        alertDescription:
          "DayStory potřebuje přístup k telefonním hovorům, aby mohl zobrazit večerní hovor.",
        cancelButton: "Zrušit",
        okButton: "Povolit",
        additionalPermissions: [],
        foregroundService: {
          channelId: "cz.daystory.app.call",
          channelName: "DayStory hovory",
          notificationTitle: "DayStory právě běží na pozadí",
        },
        selfManaged: true,
      },
    });
    if (Platform.OS === "android") {
      RNCallKeep.setAvailable(true);
    }
  } catch (err) {
    console.error("RNCallKeep.setup failed", err);
  }
}

interface IncomingCallOptions {
  uuid: string;
  callerName?: string;
}

/** Tells the OS to show the native full-screen incoming call UI. */
export function reportIncomingCall({ uuid, callerName = "DayStory" }: IncomingCallOptions) {
  RNCallKeep.displayIncomingCall(uuid, "daystory", callerName, "generic", false);
}

export function reportCallEnded(uuid: string) {
  RNCallKeep.endCall(uuid);
}

export function markCallActive(uuid: string) {
  RNCallKeep.setCurrentCallActive(uuid);
}

/** Wires CallKit's answer/end/mute events to app-level handlers. */
export function addCallKeepListeners(handlers: {
  onAnswerCall: (uuid: string) => void;
  onEndCall: (uuid: string) => void;
  onToggleMute: (uuid: string, muted: boolean) => void;
}) {
  RNCallKeep.addEventListener("answerCall", ({ callUUID }) => handlers.onAnswerCall(callUUID));
  RNCallKeep.addEventListener("endCall", ({ callUUID }) => handlers.onEndCall(callUUID));
  RNCallKeep.addEventListener("didPerformSetMutedCallAction", ({ callUUID, muted }) =>
    handlers.onToggleMute(callUUID, muted)
  );

  return () => {
    RNCallKeep.removeEventListener("answerCall");
    RNCallKeep.removeEventListener("endCall");
    RNCallKeep.removeEventListener("didPerformSetMutedCallAction");
  };
}

export const isIOS = Platform.OS === "ios";
