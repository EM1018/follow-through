import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

import { fieldStyles } from './fieldStyles';

/** A labelled row that opens a picker sheet -- shows `placeholder` (muted) until a value is chosen. */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TouchableOpacity style={styles.selectField} onPress={onPress} accessibilityRole="button">
        <Text style={[styles.selectFieldText, !value && styles.placeholderText]}>{value ?? placeholder}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  selectField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectFieldText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  placeholderText: {
    color: colors.textMuted,
  },
});
