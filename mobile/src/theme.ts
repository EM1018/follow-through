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
} as const;
