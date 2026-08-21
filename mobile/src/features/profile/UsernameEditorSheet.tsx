import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { invalidateMeQueries, updateMe, useMe, type MeRead } from './me';
import { isValidUsernameFormat, lowercaseUsername, USERNAME_HELPER_TEXT, USERNAME_TAKEN_ERROR } from './username';

// Parent conditionally mounts this component (same rationale as
// WorkoutEditSheet), so a fresh mount every open is guaranteed -- initial
// state can read the cached /me value directly.
export function UsernameEditorSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const [username, setUsername] = useState(meQuery.data?.username ?? '');

  const isValid = isValidUsernameFormat(username);

  const saveMutation = useMutation<MeRead, ApiError, void>({
    mutationFn: () => updateMe({ username }),
    onSuccess: () => {
      invalidateMeQueries(queryClient);
      onClose();
    },
  });

  function handleDismiss() {
    if (!saveMutation.isPending) {
      onClose();
    }
  }

  function handleChangeText(text: string) {
    setUsername(lowercaseUsername(text));
    // Clear a stale "taken" result the moment the user changes what they typed --
    // it described the old text, not this one.
    if (saveMutation.isError) {
      saveMutation.reset();
    }
  }

  const isTaken = saveMutation.isError && saveMutation.error.kind === 'conflict';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={handleDismiss}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <Text style={styles.title}>Username</Text>

              <View style={styles.fieldRow}>
                <Text style={styles.prefix}>@</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={handleChangeText}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
              </View>

              {saveMutation.isError ? (
                <Text style={styles.errorText}>
                  {isTaken ? USERNAME_TAKEN_ERROR : "Couldn't save changes."}
                </Text>
              ) : (
                <Text style={styles.helperText}>{USERNAME_HELPER_TEXT}</Text>
              )}

              <View style={styles.footer}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={handleDismiss}
                  disabled={saveMutation.isPending}
                  style={styles.footerButton}
                />
                <Button
                  label="Save"
                  variant="primary"
                  onPress={() => saveMutation.mutate()}
                  disabled={!isValid}
                  loading={saveMutation.isPending}
                  style={styles.footerButton}
                />
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropTouchable: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  prefix: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  helperText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
