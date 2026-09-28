import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { activeCall } from "@/services/activeCall";
import { markCallActive, reportCallEnded } from "@/services/callkeep";
import { supabase } from "@/services/supabase";
import { env } from "@/config/env";
import { colors, spacing } from "@/config/theme";
import type { TranscriptTurn } from "@/services/realtimeVoice";

function useElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function saveCompletedCall(turns: TranscriptTurn[]) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await fetch(`${env.apiBaseUrl}/api/mobile/call-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ turns }),
  });
}

export default function InCallScreen() {
  const seconds = useElapsedSeconds();
  const [muted, setMuted] = useState(false);
  const [ending, setEnding] = useState(false);
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (activeCall.uuid) markCallActive(activeCall.uuid);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  async function handleEnd() {
    if (ending) return;
    setEnding(true);

    const uuid = activeCall.uuid;
    const turns = activeCall.session?.getTranscript() ?? [];

    activeCall.end();
    if (uuid) reportCallEnded(uuid);

    if (turns.length > 0) {
      await saveCompletedCall(turns);
    }

    router.replace("/(app)");
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    activeCall.session?.setMuted(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.callerName}>DayStory</Text>
        <Text style={styles.duration}>{formatDuration(seconds)}</Text>
      </View>

      <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulse }] }]} />

      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
          <Ionicons name={muted ? "mic-off" : "mic"} size={26} color={colors.primaryForeground} />
          <Text style={styles.controlLabel}>{muted ? "Ztlumeno" : "Ztlumit"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlButton, styles.endButton]} onPress={handleEnd} disabled={ending}>
          <Ionicons name="call" size={26} color={colors.primaryForeground} style={{ transform: [{ rotate: "135deg" }] }} />
          <Text style={styles.controlLabel}>Ukončit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xl * 2,
  },
  top: { alignItems: "center" },
  callerName: { fontSize: 22, fontWeight: "600", color: colors.primaryForeground },
  duration: { fontSize: 14, color: colors.primaryForeground, opacity: 0.7, marginTop: spacing.xs },
  pulseCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.accent,
    opacity: 0.85,
  },
  controls: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  controlButton: {
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 40,
    width: 76,
    height: 76,
    justifyContent: "center",
  },
  endButton: { backgroundColor: colors.destructive },
  controlLabel: { color: colors.primaryForeground, fontSize: 11 },
});
