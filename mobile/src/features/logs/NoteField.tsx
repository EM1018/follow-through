import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

import { fieldStyles } from './fieldStyles';

/** Shared by the Log tab's sheet and the schedule's tap-then-add editor -- the same free-text note, always optional. */
export function NoteField({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>Note</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder="Optional"
        placeholderTextColor={colors.textMuted}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  noteInput: {
    minHeight: spacing.xl * 2,
    textAlignVertical: 'top',
  },
});
