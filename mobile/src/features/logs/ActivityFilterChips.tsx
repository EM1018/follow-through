import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/Chip';
import { spacing } from '@/theme';

import type { Activity, ActivityInfo } from './activities';

/** Single-select, "All" always first. Built from activities present in the loaded rows -- see presentActivities. */
export function ActivityFilterChips({
  activities,
  selected,
  onSelect,
}: {
  activities: ActivityInfo[];
  selected: Activity | null;
  onSelect: (activity: Activity | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip label="All" active={selected === null} onPress={() => onSelect(null)} />
      {activities.map((info) => (
        <Chip
          key={info.activity}
          label={info.display_name}
          active={selected === info.activity}
          onPress={() => onSelect(info.activity)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
