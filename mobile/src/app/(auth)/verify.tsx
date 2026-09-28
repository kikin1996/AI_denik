import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "@/hooks/useAuth";
import { colors, radius, spacing } from "@/config/theme";

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyCode, requestCode } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    if (!email || code.trim().length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await verifyCode(email, code.trim());
      // Stack.Protected in the root layout takes over once `session` is set.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neplatný kód.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zadej kód</Text>
      <Text style={styles.subtitle}>Poslali jsme 6místný kód na {email}.</Text>

      <TextInput
        style={styles.input}
        placeholder="123456"
        placeholderTextColor={colors.mutedInk}
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        autoFocus
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonLabel}>Potvrdit</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => email && requestCode(email)} style={styles.resend}>
        <Text style={styles.resendLabel}>Poslat kód znovu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.mutedInk,
    marginBottom: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    color: colors.ink,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  error: {
    color: colors.destructive,
    marginBottom: spacing.md,
    fontSize: 13,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "600",
  },
  resend: {
    marginTop: spacing.md,
    alignItems: "center",
  },
  resendLabel: {
    color: colors.mutedInk,
    fontSize: 13,
  },
});
