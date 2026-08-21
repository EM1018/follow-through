import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useCommitments } from '@/features/goals/commitments';
import { useMe } from '@/features/profile/me';
import { signOut } from '@/features/profile/signOut';
import { UsernameEditorSheet } from '@/features/profile/UsernameEditorSheet';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const commitmentsQuery = useCommitments();
  const [usernameSheetOpen, setUsernameSheetOpen] = useState(false);

  const username = meQuery.data?.username ?? null;
  const activeCount = commitmentsQuery.data?.active.length;

  function confirmSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        // The cache is cleared either way (see signOut's own try/finally) --
        // this catch exists only so a failed network call surfaces instead
        // of becoming an unhandled rejection.
        onPress: () => {
          signOut(queryClient).catch(() => {
            Alert.alert("Couldn't sign out", 'Check your connection and try again.');
          });
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text style={styles.title}>Profile</Text>

      <Text style={styles.sectionHeader}>ACCOUNT</Text>
      <View style={styles.group}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => setUsernameSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Username"
        >
          <Text style={styles.rowLabel}>Username</Text>
          <View style={styles.rowRight}>
            {meQuery.data !== undefined ? (
              <Text style={username ? styles.rowValue : styles.rowValueUnset}>
                {username ? `@${username}` : 'Set a username'}
              </Text>
            ) : null}
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeader}>GOALS</Text>
      <View style={styles.group}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push('/(app)/manage-goals')}
          accessibilityRole="button"
          accessibilityLabel="Manage goals"
        >
          <Text style={styles.rowLabel}>Manage goals</Text>
          <View style={styles.rowRight}>
            {activeCount !== undefined ? <Text style={styles.rowValue}>{activeCount}</Text> : null}
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.signOutBlock}
        onPress={confirmSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      {usernameSheetOpen ? <UsernameEditorSheet onClose={() => setUsernameSheetOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowLabel: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowValue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  rowValueUnset: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  chevron: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  signOutBlock: {
    marginTop: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
});
