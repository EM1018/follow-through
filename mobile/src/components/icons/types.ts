/**
 * Every tab icon takes exactly these two props.
 *
 * `color` is passed IN rather than read from the theme inside the icon.
 * The tab bar is what knows whether a tab is focused, so it owns the
 * active/inactive decision and hands the resulting color down. The icons
 * stay dumb and reusable.
 */
export type TabIconProps = {
  size: number;
  color: string;
};
