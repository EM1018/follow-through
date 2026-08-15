import { Stack } from 'expo-router';

export default function PlansLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Plans' }} />
      <Stack.Screen name="new" options={{ title: 'New plan', presentation: 'modal' }} />
      <Stack.Screen name="[planId]/workouts" options={{ title: 'Workouts' }} />
    </Stack>
  );
}
