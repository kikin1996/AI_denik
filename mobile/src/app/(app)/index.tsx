import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/services/supabase";
import { colors, moodColor, moodLabel, radius, spacing } from "@/config/theme";
import type { JournalEntryRow } from "@/types/database";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function EntryCard({ entry }: { entry: JournalEntryRow }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: "/(app)/entry/[id]", params: { id: entry.id } })}
    >
      <View style={[styles.spine, { backgroundColor: moodColor(entry.mood_rating) }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardDate}>{formatDate(entry.date)}</Text>
          <Text style={styles.cardMood}>{moodLabel(entry.mood_rating)}</Text>
        </View>
        <Text style={styles.cardSummary} numberOfLines={2}>
          {entry.summary ?? "Zápis se zpracovává…"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TimelineScreen() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", profile.id)
      .order("date", { ascending: false });
    setEntries((data as JournalEntryRow[]) ?? []);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>DayStory</Text>
        <TouchableOpacity onPress={() => router.push("/(app)/settings")}>
          <Ionicons name="settings-outline" size={22} color={colors.ink} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <EntryCard entry={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Zatím tu nemáš žádné zápisy. Jakmile ti DayStory zavolá, objeví se tady tvůj první
            zápis.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  wordmark: { fontSize: 20, fontWeight: "600", color: colors.ink },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  spine: { width: 4 },
  cardBody: { flex: 1, padding: spacing.md },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  cardDate: { fontSize: 15, fontWeight: "600", color: colors.ink, textTransform: "capitalize" },
  cardMood: { fontSize: 12, color: colors.mutedInk },
  cardSummary: { fontSize: 14, color: colors.ink, opacity: 0.85, lineHeight: 20 },
  empty: {
    textAlign: "center",
    color: colors.mutedInk,
    marginTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
});
