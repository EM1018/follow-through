import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, fontSize } from '@/theme';

export function StubScreen({ label }: { label: string }) {
  return (
    <Screen style={styles.content}>
      <Text style={styles.text}>{label}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
});
