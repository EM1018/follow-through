import { Tabs } from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';

import { colors, fontSize } from '@/theme';

const TAB_ICONS = {
  index: '▦',
  log: '▤',
  goals: '◎',
  profile: '◉',
} as const;

function TabIcon({ name, color }: { name: keyof typeof TAB_ICONS; color: ColorValue }) {
  return <Text style={{ fontSize: fontSize.lg, color }}>{TAB_ICONS[name]}</Text>;
}

export function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Schedule', tabBarIcon: ({ color }) => <TabIcon name="index" color={color} /> }}
      />
      <Tabs.Screen
        name="log"
        options={{ title: 'Log', tabBarIcon: ({ color }) => <TabIcon name="log" color={color} /> }}
      />
      <Tabs.Screen
        name="goals"
        options={{ title: 'Goals', tabBarIcon: ({ color }) => <TabIcon name="goals" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} /> }}
      />
    </Tabs>
  );
}
