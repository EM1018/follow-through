import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { spacing } from '@/theme';

import type { GoalFilter } from './sections';

const FILTERS: { value: GoalFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'solo', label: 'Solo' },
  { value: 'friends', label: 'Friends' },
];

/** All / Solo / Friends -- the same pills as the Log tab's activity filter. */
export function GoalFilterChips({ selected, onSelect }: { selected: GoalFilter; onSelect: (filter: GoalFilter) => void }) {
  return (
    <View style={styles.row}>
      {FILTERS.map(({ value, label }) => (
        <Chip key={value} label={label} active={selected === value} onPress={() => onSelect(value)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
