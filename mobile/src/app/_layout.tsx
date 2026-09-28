import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import * as Notifications from "expo-notifications";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { addCallKeepListeners, reportCallEnded, setupCallKeep } from "@/services/callkeep";
import { activeCall } from "@/services/activeCall";
import { colors } from "@/config/theme";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    setupCallKeep();

    const removeListeners = addCallKeepListeners({
      onAnswerCall: async (uuid) => {
        router.push("/call/in-call");
        try {
          await activeCall.start(uuid);
        } catch (err) {
          console.error("Failed to start realtime voice session", err);
          reportCallEnded(uuid);
          router.back();
        }
      },
      onEndCall: () => {
        activeCall.end();
        if (router.canGoBack()) router.back();
      },
      onToggleMute: (_uuid, muted) => {
        activeCall.session?.setMuted(muted);
      },
    });

    return removeListeners;
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="call/in-call" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
