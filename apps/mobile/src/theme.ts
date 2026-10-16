/**
 * Design tokens shared across the mobile app.
 *
 * Mirrors the web app's credible scientific/financial tone (spec §13):
 * light theme, deep navy/teal accents, restrained status colors.
 * Values are copied from apps/web/src/app/globals.css so the two
 * clients stay visually consistent.
 */
export const colors = {
  navy: "#0f2a43",
  navy2: "#16395c",
  teal: "#0e7c7b",
  tealBright: "#13a39f",
  tealSoft: "#e6f4f3",
  ink: "#1c2733",
  muted: "#5b6b7c",
  placeholder: "#8493a3",
  navyText: "#b8c8d8",
  line: "#dfe7ee",
  bg: "#f4f7f9",
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

export const radius = 14;

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
