/**
 * Design tokens shared across the mobile app.
 *
 * Deep navy/teal stays the anchor (credible scientific/financial tone), with
 * a set of category accents so different kinds of catalysts are easy to tell
 * apart at a glance.
 */
export const colors = {
  navy: "#061a30",
  navy2: "#0c2c4d",
  navy3: "#12406b",
  teal: "#007f7a",
  tealBright: "#00b5a6",
  tealSoft: "#dcf8f2",
  mint: "#7eeede",
  ink: "#0f2134",
  ink2: "#334155",
  muted: "#64748b",
  placeholder: "#8493a3",
  navyText: "#c5d8e8",
  line: "#e3e9f0",
  lineStrong: "#cfd9e3",
  bg: "#f2f5f9",
  inputBg: "#f8fafb",
  card: "#ffffff",
  amber: "#9a6a00",
  amberBright: "#f59e0b",
  amberSoft: "#fdf3dd",
  green: "#1c7a3d",
  greenBright: "#22c55e",
  greenSoft: "#e7f5ec",
  red: "#b3261e",
  redBright: "#ef4444",
  redSoft: "#fbeae9",
  violet: "#6d4bd8",
  violetSoft: "#efeafd",
  blue: "#1f63d6",
  blueSoft: "#e6efff",
  rose: "#c2335f",
  roseSoft: "#fdeaf0",
  slateSoft: "#eef2f6",
  white: "#ffffff",
} as const;

export const radius = 18;
export const radiusSm = 12;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  title: 24,
  hero: 28,
} as const;

/** Soft, low-cost card shadow (one elevation level everywhere keeps Android fast). */
export const shadow = {
  shadowColor: colors.navy,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 2,
} as const;
