import { useRef } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { colors, fontSize, fontWeight, minRowHeight, spacing } from '@/theme';

import type { CompletionRead } from './completions';
import { deleteCompletionDialogCopy, SCHEDULED_SOURCE_LABEL } from './logCopy';
import { formatAmount } from './units';

export function LogRow({
  completion,
  onPress,
  onDelete,
}: {
  completion: CompletionRead;
  onPress: (completion: CompletionRead) => void;
  onDelete: (id: string) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  const amount = formatAmount(completion.value, completion.unit);
  const subtitle = [completion.source === 'scheduled' ? SCHEDULED_SOURCE_LABEL : null, completion.note]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  function confirmDelete() {
    swipeableRef.current?.close();
    Alert.alert(deleteCompletionDialogCopy.title, deleteCompletionDialogCopy.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(completion.id) },
    ]);
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={confirmDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${completion.label}`}
        >
          <Text style={styles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      )}
    >
      <TouchableOpacity
        style={styles.row}
        onPress={() => onPress(completion)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${completion.label}`}
      >
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>
            {completion.label}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {amount ? <Text style={styles.amount}>{amount}</Text> : null}
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minRowHeight.day,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  amount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  deleteActionText: {
    color: colors.background,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
