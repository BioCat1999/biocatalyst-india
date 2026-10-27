/**
 * Design tokens shared across the mobile app.
 *
 * Mirrors the web app's credible scientific/financial tone (spec §13):
 * light theme, deep navy/teal accents, restrained status colors.
 * Values are copied from apps/web/src/app/globals.css so the two
 * clients stay visually consistent.
 */
export const colors = {
  navy: "#071b31",
  navy2: "#0d2d4d",
  teal: "#007f7a",
  tealBright: "#00b5a6",
  tealSoft: "#dcf8f2",
  ink: "#102235",
  muted: "#64748b",
  placeholder: "#8493a3",
  navyText: "#c5d8e8",
  line: "#dce5ed",
  bg: "#f4f7fa",
  inputBg: "#f8fafb",
  card: "#ffffff",
  amber: "#9a6a00",
  amberSoft: "#fdf3dd",
  green: "#1c7a3d",
  greenSoft: "#e7f5ec",
  red: "#b3261e",
  redSoft: "#fbeae9",
  white: "#ffffff",
} as const;

export const radius = 18;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  title: 24,
} as const;
