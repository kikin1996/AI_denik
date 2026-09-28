import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/services/supabase";
import { registerForVoipCalls } from "@/services/voipPush";
import { colors, radius, spacing } from "@/config/theme";

export default function SettingsScreen() {
  const { profile, refreshProfile, signOut } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [callTime, setCallTime] = useState("20:00");
  const [callEnabled, setCallEnabled] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pushStatus, setPushStatus] = useState<"idle" | "registering" | "registered" | "error">(
    "idle"
  );

  // Seed the form from `profile` once it loads, without an effect — React's
  // recommended pattern for "adjust state when a prop changes" is to do it
  // during render (gated on an id we've already applied), not in useEffect.
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  if (profile && profile.id !== loadedProfileId) {
    setLoadedProfileId(profile.id);
    setPhoneNumber(profile.phone_number ?? "");
    setCallTime(profile.preferred_call_time.slice(0, 5));
    setCallEnabled(profile.call_enabled);
  }

  async function handleSave() {
    if (!profile) return;
    setStatus("saving");
    const { error } = await supabase
      .from("users")
      .update({
        phone_number: phoneNumber || null,
        preferred_call_time: `${callTime}:00`,
        call_enabled: callEnabled,
      })
      .eq("id", profile.id);

    if (error) {
      setStatus("error");
      return;
    }
    await refreshProfile();
    setStatus("saved");
  }

  async function handleEnableCalls() {
    setPushStatus("registering");
    try {
      await registerForVoipCalls();
      setPushStatus("registered");
    } catch {
      setPushStatus("error");
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Večerní hovor</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Telefonní číslo</Text>
        <TextInput
          style={styles.input}
          placeholder="+420123456789"
          placeholderTextColor={colors.mutedInk}
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Čas hovoru (HH:MM)</Text>
        <TextInput
          style={styles.input}
          placeholder="20:00"
          placeholderTextColor={colors.mutedInk}
          value={callTime}
          onChangeText={setCallTime}
        />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Denní hovory zapnuty</Text>
          <Text style={styles.hint}>DayStory ti bude volat automaticky.</Text>
        </View>
        <Switch value={callEnabled} onValueChange={setCallEnabled} />
      </View>

      <TouchableOpacity
        style={[styles.button, status === "saving" && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={status === "saving"}
      >
        {status === "saving" ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonLabel}>Uložit</Text>
        )}
      </TouchableOpacity>
      {status === "saved" && <Text style={styles.success}>Uloženo.</Text>}
      {status === "error" && <Text style={styles.error}>Něco se pokazilo.</Text>}

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Hovory v appce</Text>
      <Text style={styles.hint}>
        Povol push notifikace, aby ti DayStory mohl zazvonit přímo v appce (jako hovor přes
        WhatsApp), místo na klasické telefonní číslo.
      </Text>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={handleEnableCalls}
        disabled={pushStatus === "registering"}
      >
        <Text style={styles.secondaryButtonLabel}>
          {pushStatus === "registered" ? "Zapnuto ✓" : "Povolit hovory v appce"}
        </Text>
      </TouchableOpacity>
      {pushStatus === "error" && (
        <Text style={styles.error}>Registrace se nezdařila. Zkus to znovu.</Text>
      )}

      <TouchableOpacity onPress={signOut} style={styles.signOut}>
        <Text style={styles.signOutLabel}>Odhlásit se</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.ink, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.mutedInk, marginBottom: spacing.xs },
  hint: { fontSize: 12, color: colors.mutedInk, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: colors.primaryForeground, fontSize: 16, fontWeight: "600" },
  secondaryButtonLabel: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  success: { color: "#2f7a4d", marginTop: spacing.sm, fontSize: 13 },
  error: { color: colors.destructive, marginTop: spacing.sm, fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },
  signOut: { marginTop: spacing.xl, alignItems: "center" },
  signOutLabel: { color: colors.destructive, fontSize: 14 },
});
