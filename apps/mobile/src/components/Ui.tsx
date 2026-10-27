/**
 * Shared presentational primitives — cards, section titles, chips, segmented
 * controls, skeleton placeholders and loading / error / empty states — in the
 * app's navy/teal visual language.
 */
import React, { memo, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Rect, Stop, Circle } from "react-native-svg";
import { colors, fontSize, radius, radiusSm, shadow, spacing } from "../theme";
import type { IconName } from "../lib/categories";

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  children,
  icon,
  color = colors.teal,
  right,
}: {
  children: React.ReactNode;
  icon?: IconName;
  color?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionRow}>
      {icon ? (
        <View style={[styles.sectionIcon, { backgroundColor: `${color}1f` }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>{children}</Text>
      {right ? <View style={styles.sectionRight}>{right}</View> : null}
    </View>
  );
}

/** Round tinted icon used on cards and list rows. */
export function IconBadge({ icon, color, soft, size = 34 }: { icon: IconName; color: string; soft: string; size?: number }) {
  return (
    <View style={[styles.iconBadge, { width: size, height: size, borderRadius: size / 2.6, backgroundColor: soft }]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/**
 * Navy hero band with a soft teal glow. Rendered with react-native-svg so it
 * needs no extra native dependency.
 */
export function HeroHeader({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.hero, style]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="heroBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="0.65" stopColor={colors.navy2} />
            <Stop offset="1" stopColor={colors.navy3} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#heroBg)" />
        <Circle cx="92" cy="8" r="34" fill={colors.tealBright} opacity={0.12} />
        <Circle cx="10" cy="110" r="30" fill={colors.mint} opacity={0.06} />
      </Svg>
      {children}
    </View>
  );
}

export function LoadingView({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.teal} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

/** Pulsing placeholder block. All skeletons share one native-driver animation. */
const pulse = new Animated.Value(0.55);
let pulseUsers = 0;
let pulseLoop: Animated.CompositeAnimation | null = null;

function usePulse() {
  useEffect(() => {
    pulseUsers += 1;
    if (!pulseLoop) {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: true }),
        ]),
      );
      pulseLoop.start();
    }
    return () => {
      pulseUsers -= 1;
      if (pulseUsers === 0 && pulseLoop) {
        pulseLoop.stop();
        pulseLoop = null;
      }
    };
  }, []);
  return pulse;
}

function Bone({ width, height = 12, style }: { width: number | `${number}%`; height?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = usePulse();
  return <Animated.View style={[styles.bone, { width, height, opacity }, style]} />;
}

export const SkeletonCard = memo(function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.skelTop}>
        <Bone width={34} height={34} style={{ borderRadius: 12 }} />
        <Bone width={110} height={14} style={{ marginLeft: spacing.sm }} />
      </View>
      <Bone width="92%" height={18} style={{ marginTop: spacing.md }} />
      <Bone width="70%" height={18} style={{ marginTop: 6 }} />
      <Bone width="100%" style={{ marginTop: spacing.md }} />
      <Bone width="85%" style={{ marginTop: 6 }} />
    </View>
  );
});

export function SkeletonList({ count = 4, header }: { count?: number; header?: React.ReactNode }) {
  return (
    <View>
      {header}
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <IconBadge icon="cloud-offline" color={colors.red} soft={colors.redSoft} size={56} />
      <Text style={styles.errorTitle}>Couldn’t load this</Text>
      <Text style={styles.muted}>{message}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
        <Ionicons name="refresh" size={16} color={colors.white} />
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function EmptyView({ message, icon = "sparkles-outline" }: { message: string; icon?: IconName }) {
  return (
    <View style={styles.center}>
      <IconBadge icon={icon} color={colors.teal} soft={colors.tealSoft} size={56} />
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

export const Chip = memo(function Chip({
  label,
  active,
  onPress,
  icon,
  color = colors.navy,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Accent used for the icon and the active state. */
  color?: string;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: color, borderColor: color },
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={13} color={active ? colors.white : color} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {count !== undefined ? (
        <View style={[styles.chipCount, active && styles.chipCountActive]}>
          <Text style={[styles.chipCountText, active && styles.chipTextActive]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/** Pill-style segmented control (e.g. List / Week / Month). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: ReadonlyArray<{ value: T; label: string; icon?: IconName }>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segment, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            {option.icon ? (
              <Ionicons name={option.icon} size={14} color={active ? colors.navy : colors.navyText} />
            ) : null}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primaryButton, disabled && styles.primaryButtonDisabled, pressed && styles.pressed]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    ...shadow,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionIcon: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: "800", color: colors.navy, letterSpacing: -0.2 },
  sectionRight: { marginLeft: "auto" },
  iconBadge: { alignItems: "center", justifyContent: "center" },
  hero: { overflow: "hidden", backgroundColor: colors.navy },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  muted: { color: colors.muted, fontSize: fontSize.md, textAlign: "center", lineHeight: 21 },
  errorTitle: { color: colors.ink, fontSize: fontSize.lg, fontWeight: "800", marginTop: spacing.xs },
  retryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.teal,
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  retryText: { color: colors.white, fontWeight: "700", fontSize: fontSize.md },
  bone: { backgroundColor: colors.lineStrong, borderRadius: 6 },
  skelTop: { flexDirection: "row", alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    marginRight: spacing.sm,
    backgroundColor: colors.card,
  },
  chipText: { color: colors.ink2, fontSize: fontSize.sm, fontWeight: "700" },
  chipTextActive: { color: colors.white },
  chipCount: { backgroundColor: colors.slateSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  chipCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  chipCountText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  segment: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 999,
  },
  segmentItemActive: { backgroundColor: colors.white },
  segmentText: { color: colors.navyText, fontSize: fontSize.sm, fontWeight: "700" },
  segmentTextActive: { color: colors.navy, fontWeight: "800" },
  primaryButton: {
    backgroundColor: colors.teal,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: colors.white, fontWeight: "700", fontSize: fontSize.md },
});
