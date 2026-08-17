import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

type BadgeVariant = 'accent' | 'success' | 'muted';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
};

export function Badge({ label, variant = 'accent' }: BadgeProps) {
  return (
    <View style={[styles.badge, variantStyles[variant]]}>
      <Text style={[styles.label, labelVariantStyles[variant]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});

const variantStyles = StyleSheet.create({
  accent: {
    backgroundColor: colors.accent,
  },
  success: {
    backgroundColor: colors.success,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
  },
});

const labelVariantStyles = StyleSheet.create({
  accent: {
    color: colors.background,
  },
  success: {
    color: colors.background,
  },
  muted: {
    color: colors.textMuted,
  },
});
