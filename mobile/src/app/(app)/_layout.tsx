import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" options={{ headerShown: true, title: "Nastavení" }} />
      <Stack.Screen name="entry/[id]" options={{ headerShown: true, title: "" }} />
    </Stack>
  );
}
