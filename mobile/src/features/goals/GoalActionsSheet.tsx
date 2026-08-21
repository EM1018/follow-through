import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import {
  deleteCommitment,
  endCommitment,
  invalidateCommitmentsQueries,
  type CommitmentRead,
} from './commitments';
import { goalTermsLine } from './goalTerms';
import {
  canEndGoal,
  DELETE_GOAL_CONFIRM_MESSAGE,
  DELETE_GOAL_CONFIRM_TITLE,
  END_GOAL_CONFIRM_MESSAGE,
  END_GOAL_CONFIRM_TITLE,
  type GoalVariant,
} from './manageGoalsCopy';

export function GoalActionsSheet({
  commitment,
  activityDisplayName,
  variant,
  onClose,
}: {
  commitment: CommitmentRead;
  activityDisplayName: string;
  variant: GoalVariant;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const invalidateAndClose = () => {
    invalidateCommitmentsQueries(queryClient);
    onClose();
  };

  const endMutation = useMutation<CommitmentRead, ApiError, void>({
    mutationFn: () => endCommitment(commitment.id),
    onSuccess: invalidateAndClose,
    onError: (error) => {
      if (error.kind === 'not_found' || error.kind === 'conflict') {
        invalidateAndClose();
        return;
      }
      Alert.alert("Couldn't end this goal.", 'Try again.');
    },
  });

  const deleteMutation = useMutation<void, ApiError, void>({
    mutationFn: () => deleteCommitment(commitment.id),
    onSuccess: invalidateAndClose,
    onError: (error) => {
      if (error.kind === 'not_found') {
        invalidateAndClose();
        return;
      }
      Alert.alert("Couldn't delete this goal.", 'Try again.');
    },
  });

  // Both actions confirm before firing, and deliberately no swipe-to-delete
  // anywhere that reaches this sheet -- a goal is weeks of accumulated
  // progress, not a single log entry, so this stays a two-step action.
  function confirmEnd() {
    Alert.alert(END_GOAL_CONFIRM_TITLE, END_GOAL_CONFIRM_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End goal', onPress: () => endMutation.mutate() },
    ]);
  }

  function confirmDelete() {
    Alert.alert(DELETE_GOAL_CONFIRM_TITLE, DELETE_GOAL_CONFIRM_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <Card style={styles.sheet}>
            <Text style={styles.title}>{activityDisplayName}</Text>
            <Text style={styles.subtitle}>{goalTermsLine(commitment)}</Text>

            <View style={styles.divider} />

            {canEndGoal(variant) ? (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={confirmEnd}
                accessibilityRole="button"
                accessibilityLabel="End goal"
              >
                <Text style={styles.accentText}>End goal</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.actionRow}
              onPress={confirmDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete goal"
            >
              <Text style={styles.destructiveText}>Delete goal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    gap: spacing.xs,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  actionRow: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  accentText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  destructiveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  cancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
});
