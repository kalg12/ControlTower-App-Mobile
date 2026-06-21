import { Stack } from "expo-router";

export default function KanbanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="work" />
      <Stack.Screen name="[boardId]" />
    </Stack>
  );
}
