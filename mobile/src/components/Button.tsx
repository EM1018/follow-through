import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.base, variantStyles[variant], isDisabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.background : colors.accent} />
      ) : (
        <Text style={[styles.label, labelVariantStyles[variant]]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
});

const labelVariantStyles = StyleSheet.create({
  primary: {
    color: colors.background,
  },
  secondary: {
    color: colors.text,
  },
  ghost: {
    color: colors.accent,
  },
});
