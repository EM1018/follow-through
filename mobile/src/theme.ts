/**
 * Placeholder design tokens -- chosen for legibility, not final visual design.
 * Every color, spacing value, radius, and font size in the app should come from here.
 */

export const colors = {
  background: '#FFFFFF',
  surface: '#F5F5F7',
  surfaceMuted: '#ECECEF',
  border: '#E1E1E6',
  text: '#111114',
  textMuted: '#6B6B76',
  accent: '#208AEF',
  danger: '#D6423C',
  success: '#1A9C4A',
  overlay: 'rgba(17, 17, 20, 0.5)',
} as const;

/** Bottom tab bar icon/label tints -- same blue as the Log tab's active filter chip. */
export const tabBar = {
  active: colors.accent,
  inactive: colors.textMuted,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Small decorative dot diameters -- page indicators, month-cell status marks. */
export const dotSize = {
  sm: 5,
  md: 6,
  /** The substituted-day glyph's badge -- big enough to ring the swap character. */
  lg: 16,
} as const;

/** Minimum row height so a Day view item clears a comfortable tap target. */
export const minRowHeight = {
  day: 56,
} as const;

/** Contribution graph cells -- a fixed 0-3 intensity scale, not relative to any single window's data. */
export const graph = {
  level0: '#E4E4E9',
  level1: '#BEE0FC',
  level2: '#6CB8F2',
  level3: '#0B6FCB',
  cellSize: 14,
  cellGap: 4,
  cellRadius: 3,
} as const;

/** A goal card's big "sessions done this week" number -- larger than any existing fontSize step. */
export const heroFontSize = 40;

/** Goal-progress week circles: `normal` in an expanded card's circle row, `mini` in a collapsed row. */
export const circleSize = {
  normal: 20,
  mini: 8,
} as const;

/** The active goal card's segmented weekly-progress bar. */
export const segmentBar = {
  height: 8,
  gap: spacing.xs,
} as const;
