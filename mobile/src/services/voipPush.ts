import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
// iOS-only native module (PushKit). Importing it on Android is harmless —
// the library no-ops — but all calls below are still guarded by Platform.OS.
import VoipPushNotification from "react-native-voip-push-notification";

import { supabase } from "@/services/supabase";
import { env } from "@/config/env";

async function authedFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  return fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

async function savePushToken(params: {
  platform: "ios" | "android";
  voipToken?: string;
  devicePushToken?: string;
}) {
  const res = await authedFetch("/api/mobile/register-push-token", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to register push token (${res.status})`);
}

/**
 * iOS: registers for a PushKit VoIP token (no permission prompt required —
 * that's the whole point of VoIP push) and forwards it to the backend so the
 * hourly cron job can wake this device via APNs.
 *
 * Android: there's no VoIP-push equivalent; a high-priority FCM data message
 * combined with react-native-callkeep's ConnectionService achieves the same
 * "rings like a call" effect, so we register a regular Expo/FCM device
 * push token instead.
 */
export async function registerForVoipCalls(): Promise<void> {
  if (Platform.OS === "ios") {
    return new Promise((resolve, reject) => {
      VoipPushNotification.addEventListener("register", async (token: string) => {
        try {
          await savePushToken({ platform: "ios", voipToken: token });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      VoipPushNotification.registerVoipToken();
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Notification permission denied");
  }
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  await savePushToken({ platform: "android", devicePushToken: token });
}

/**
 * Subscribes to incoming VoIP push payloads (iOS only). Call once at app
 * startup, alongside setupCallKeep(). The native AppDelegate patch described
 * in mobile/ios/NATIVE_SETUP.md is what actually reports the call to CallKit
 * BEFORE this JS listener fires — this listener is for app-level bookkeeping
 * (e.g. remembering which call UUID to connect the realtime voice session to)
 * once the JS bridge is up.
 */
export function addVoipNotificationListener(handler: (payload: any) => void) {
  if (Platform.OS !== "ios") return () => {};

  VoipPushNotification.addEventListener("notification", handler);
  return () => VoipPushNotification.removeEventListener("notification");
}
