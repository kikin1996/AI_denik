import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/services/supabase";
import { colors, moodColor, moodLabel, spacing } from "@/config/theme";
import type { JournalEntryRow } from "@/types/database";

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [entry, setEntry] = useState<JournalEntryRow | null>(null);

  useEffect(() => {
    if (!profile || !id) return;
    supabase
      .from("journal_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setEntry(data as JournalEntryRow | null));
  }, [id, profile]);

  if (!entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Načítám…</Text>
      </View>
    );
  }

  const weekday = new Date(entry.date).toLocaleDateString("cs-CZ", { weekday: "long" });
  const rest = new Date(entry.date).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <View style={[styles.spine, { backgroundColor: moodColor(entry.mood_rating) }]} />
        <View style={styles.rowBody}>
          <Text style={styles.date}>
            <Text style={styles.dateWeekday}>{weekday}</Text> {rest}
          </Text>
          <Text style={styles.mood}>
            {moodLabel(entry.mood_rating)}
            {entry.mood_rating !== null ? ` · ${entry.mood_rating}/10` : ""}
          </Text>

          <Text style={styles.summary}>{entry.summary ?? "Zápis se ještě zpracovává."}</Text>

          {entry.tags && entry.tags.length > 0 && (
            <View style={styles.tags}>
              {entry.tags.map((tag) => (
                <Text key={tag} style={styles.tag}>
                  {tag}
                </Text>
              ))}
            </View>
          )}

          {entry.key_events && entry.key_events.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Klíčové události</Text>
              {entry.key_events.map((event, i) => (
                <Text key={i} style={styles.listItem}>
                  •  {event}
                </Text>
              ))}
            </View>
          )}

          {entry.audio_url && <AudioPlayer url={entry.audio_url} />}

          {entry.raw_transcript && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Celý přepis</Text>
              <Text style={styles.transcript}>{entry.raw_transcript}</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function AudioPlayer({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  function toggle() {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Nahrávka hovoru</Text>
      <Text style={styles.playButton} onPress={toggle}>
        {status.playing ? "⏸  Pozastavit" : "▶  Přehrát nahrávku"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  muted: { color: colors.mutedInk, textAlign: "center", marginTop: spacing.xl },
  row: { flexDirection: "row" },
  spine: { width: 3, borderRadius: 2, marginRight: spacing.md },
  rowBody: { flex: 1 },
  date: { fontSize: 22, fontWeight: "600", color: colors.ink },
  dateWeekday: { textTransform: "capitalize" },
  mood: { fontSize: 13, color: colors.mutedInk, marginTop: 4, marginBottom: spacing.md },
  summary: { fontSize: 16, lineHeight: 24, color: colors.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.md, gap: spacing.sm },
  tag: { fontSize: 13, color: colors.mutedInk },
  section: { marginTop: spacing.lg },
  sectionLabel: { fontSize: 13, color: colors.mutedInk, marginBottom: spacing.sm },
  listItem: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  transcript: { fontSize: 14, color: colors.mutedInk, lineHeight: 22 },
  playButton: { fontSize: 15, color: colors.primary, fontWeight: "600" },
});
