import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, fontWeight, graph, spacing } from '@/theme';

import type { Cell } from './graph';
import { level } from './graph';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const LEVEL_COLORS = [graph.level0, graph.level1, graph.level2, graph.level3];

function GraphCell({ cell }: { cell: Cell }) {
  // Future cells are empty space -- a resting fill would claim "nothing
  // logged" about a day that hasn't happened yet.
  if (cell.isFuture) {
    return <View style={styles.cell} />;
  }
  return (
    <View
      style={[
        styles.cell,
        styles.cellFilled,
        { backgroundColor: LEVEL_COLORS[level(cell.count)] },
        cell.isToday && styles.cellToday,
      ]}
    />
  );
}

export function ContributionGraph({ grid, totalCount }: { grid: Cell[][]; totalCount: number }) {
  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <View key={index} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{initial}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((cell) => (
              <GraphCell key={cell.date} cell={cell} />
            ))}
          </View>
        ))}
      </View>

      <Text style={styles.caption}>{`last 8 weeks · ${totalCount} logs`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: graph.cellGap,
  },
  weekdayCell: {
    width: graph.cellSize,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  grid: {
    gap: graph.cellGap,
  },
  weekRow: {
    flexDirection: 'row',
    gap: graph.cellGap,
  },
  cell: {
    width: graph.cellSize,
    height: graph.cellSize,
    borderRadius: graph.cellRadius,
  },
  cellFilled: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  caption: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
