/**
 * Catalyst calendar with three views:
 *  - Agenda: everything upcoming, grouped by day with countdowns
 *  - Week:   a Monday–Sunday strip plus that week's milestones
 *  - Month:  a month grid with colored dots per kind; tap a day to see it
 *
 * Week and month fetch exactly their date window (`from` / `to`) and filter
 * by kind on the device, so switching filters is instant. Neighbouring
 * periods are prefetched so paging back and forth feels immediate.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CalendarResponse } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { Chip, EmptyView, ErrorView, HeroHeader, Screen, Segmented, SkeletonList } from "../components/Ui";
import { prefetchApi, useApiCall } from "../hooks/useApiCall";
import type { RootStackParamList } from "../navigation/types";
import { colors, fontSize, radius, shadow, spacing } from "../theme";
import { kindLabel, kindStyle, type IconName } from "../lib/categories";
import {
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  countdownLabel,
  dayLabel,
  endOfMonth,
  fromDay,
  groupByDay,
  monthGrid,
  monthTitle,
  startOfMonth,
  startOfWeek,
  toDay,
  weekDays,
  weekTitle,
} from "../lib/calendarDates";

type Props = NativeStackScreenProps<RootStackParamList, "Calendar">;
type Item = CalendarResponse["items"][number];
type View_ = "agenda" | "week" | "month";

const VIEWS: ReadonlyArray<{ value: View_; label: string; icon: IconName }> = [
  { value: "agenda", label: "Agenda", icon: "list" },
  { value: "week", label: "Week", icon: "calendar-clear" },
  { value: "month", label: "Month", icon: "calendar" },
];

const FILTERS: ReadonlyArray<{ label: string; kind: string }> = [
  { label: "All", kind: "" },
  { label: "Trials", kind: "trial_completion" },
  { label: "PDUFA", kind: "pdufa" },
  { label: "Patents", kind: "patent_expiry" },
  { label: "Regulatory", kind: "regulatory_decision" },
];

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type Period = { from: string; to: string; key: string };

function periodFor(view: View_, anchor: Date): Period | null {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { from: toDay(start), to: toDay(addDays(start, 6)), key: `w:${toDay(start)}` };
  }
  if (view === "month") {
    const start = startOfMonth(anchor);
    return { from: toDay(start), to: toDay(endOfMonth(start)), key: `m:${toDay(start)}` };
  }
  return null;
}

function loadPeriod(period: Period) {
  return getApiClient().getCalendar({ from: period.from, to: period.to, limit: 500 });
}

export function CalendarScreen({ navigation }: Props) {
  const [view, setView] = useState<View_>("agenda");
  const [kind, setKind] = useState("");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = toDay(new Date());

  const period = periodFor(view, anchor);
  const cacheKey = period ? `calendar:${period.key}` : `calendar:agenda:${kind}`;
  const load = useCallback(
    () =>
      period
        ? loadPeriod(period)
        : getApiClient().getCalendar({ kind: kind || undefined, limit: 250 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey],
  );
  const calendar = useApiCall(load, cacheKey, { cacheKey, staleMs: 300_000 });

  // Warm the previous and next period so arrows respond instantly.
  useEffect(() => {
    if (view === "agenda") return;
    for (const step of [-1, 1]) {
      const next = periodFor(view, view === "week" ? addDays(anchor, 7 * step) : addMonths(anchor, step));
      if (next) void prefetchApi(`calendar:${next.key}`, () => loadPeriod(next)).catch(() => undefined);
    }
  }, [view, anchor]);

  // Items inside the window (also guards against an older API ignoring from/to).
  const periodItems = useMemo(() => {
    const items = calendar.data?.items ?? [];
    if (!period) return items;
    return items.filter((item) => item.date >= period.from && item.date <= period.to);
  }, [calendar.data, period?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const map: Record<string, number> = { "": periodItems.length };
    for (const item of periodItems) map[item.kind] = (map[item.kind] ?? 0) + 1;
    return map;
  }, [periodItems]);

  const visible = useMemo(
    () => (period && kind ? periodItems.filter((item) => item.kind === kind) : periodItems),
    [periodItems, kind, period?.key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const byDay = useMemo(() => groupByDay(visible), [visible]);

  const listItems = useMemo(() => {
    const days = selectedDay && view !== "agenda" ? [selectedDay] : [...byDay.keys()];
    const rows: Array<{ type: "day"; day: string; count: number } | { type: "item"; item: Item }> = [];
    for (const day of days) {
      const items = byDay.get(day) ?? [];
      if (!items.length) continue;
      rows.push({ type: "day", day, count: items.length });
      for (const item of items) rows.push({ type: "item", item });
    }
    return rows;
  }, [byDay, selectedDay, view]);

  const step = (dir: -1 | 1) => {
    setSelectedDay(null);
    setAnchor((a) => (view === "week" ? addDays(a, 7 * dir) : addMonths(a, dir)));
  };
  const goToday = () => {
    setSelectedDay(null);
    setAnchor(new Date());
  };
  const changeView = (next: View_) => {
    setSelectedDay(null);
    setView(next);
  };

  const openCompany = useCallback((slug: string) => navigation.navigate("Company", { slug }), [navigation]);

  const header = (
    <View>
      <HeroHeader style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="calendar" size={20} color={colors.mint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>WHAT’S COMING UP</Text>
            <Text style={styles.heroTitle}>
              {view === "agenda" ? "Upcoming catalysts" : view === "week" ? weekTitle(startOfWeek(anchor)) : monthTitle(anchor)}
            </Text>
          </View>
          {view !== "agenda" ? (
            <View style={styles.navRow}>
              <NavButton icon="chevron-back" label="Previous" onPress={() => step(-1)} />
              <Pressable onPress={goToday} style={styles.todayBtn} accessibilityRole="button">
                <Text style={styles.todayText}>Today</Text>
              </Pressable>
              <NavButton icon="chevron-forward" label="Next" onPress={() => step(1)} />
            </View>
          ) : null}
        </View>
        <Segmented options={VIEWS} value={view} onChange={changeView} style={styles.segment} />
      </HeroHeader>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.label}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        renderItem={({ item: f }) => {
          const style = f.kind ? kindStyle(f.kind) : { color: colors.navy, icon: "apps" as IconName };
          return (
            <Chip
              label={f.label}
              icon={style.icon}
              color={style.color}
              active={kind === f.kind}
              count={period && !calendar.loading ? counts[f.kind] ?? 0 : undefined}
              onPress={() => setKind(f.kind)}
            />
          );
        }}
      />

      {view === "week" && !calendar.loading ? (
        <WeekStrip anchor={anchor} byDay={byDay} today={today} selected={selectedDay} onSelect={setSelectedDay} />
      ) : null}
      {view === "month" && !calendar.loading ? (
        <MonthGrid anchor={anchor} byDay={byDay} today={today} selected={selectedDay} onSelect={setSelectedDay} />
      ) : null}
      {selectedDay && view !== "agenda" ? (
        <Pressable onPress={() => setSelectedDay(null)} style={styles.clearDay} accessibilityRole="button">
          <Ionicons name="close-circle" size={15} color={colors.teal} />
          <Text style={styles.clearDayText}>Showing {dayLabel(selectedDay)} · show whole {view}</Text>
        </Pressable>
      ) : null}
      <Legend />
    </View>
  );

  if (calendar.error && !calendar.data) {
    return <Screen>{header}<ErrorView message={calendar.error.message} onRetry={calendar.retry} /></Screen>;
  }

  return (
    <Screen>
      <FlatList
        data={calendar.loading ? [] : listItems}
        keyExtractor={(row) => (row.type === "day" ? `d:${row.day}` : row.item.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={
          calendar.loading ? (
            <SkeletonList count={3} />
          ) : (
            <EmptyView
              icon="calendar-outline"
              message={
                selectedDay
                  ? "Nothing scheduled on this day."
                  : view === "agenda"
                    ? "No upcoming milestones match this filter."
                    : `No milestones this ${view}${kind ? " for this filter" : ""}. Try the arrows to look ahead.`
              }
            />
          )
        }
        renderItem={({ item: row }) =>
          row.type === "day" ? (
            <DayHeader day={row.day} count={row.count} today={today} />
          ) : (
            <CalendarItemCard item={row.item} onCompany={openCompany} />
          )
        }
        contentContainerStyle={styles.content}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
      />
    </Screen>
  );
}

function NavButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={styles.navBtn}>
      <Ionicons name={icon} size={18} color={colors.white} />
    </Pressable>
  );
}

function Dots({ items }: { items: Item[] | undefined }) {
  if (!items?.length) return <View style={styles.dotsRow} />;
  const kinds = [...new Set(items.map((i) => i.kind))].slice(0, 3);
  return (
    <View style={styles.dotsRow}>
      {kinds.map((k) => (
        <View key={k} style={[styles.dot, { backgroundColor: kindStyle(k).color }]} />
      ))}
    </View>
  );
}

const WeekStrip = memo(function WeekStrip({
  anchor,
  byDay,
  today,
  selected,
  onSelect,
}: {
  anchor: Date;
  byDay: Map<string, Item[]>;
  today: string;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const days = weekDays(startOfWeek(anchor));
  return (
    <View style={styles.weekStrip}>
      {days.map((d, i) => {
        const day = toDay(d);
        const items = byDay.get(day);
        const isSel = selected === day;
        const isToday = today === day;
        const past = day < today;
        return (
          <Pressable
            key={day}
            onPress={() => onSelect(isSel ? null : day)}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel(day)}, ${items?.length ?? 0} milestones`}
            style={[styles.weekCell, isToday && styles.weekCellToday, isSel && styles.weekCellSel, past && styles.past]}
          >
            <Text style={[styles.weekDayName, isSel && styles.selText]}>{WEEKDAYS_SHORT[i]}</Text>
            <Text style={[styles.weekDayNum, isSel && styles.selText]}>{d.getDate()}</Text>
            {items?.length ? (
              <View style={[styles.countBubble, isSel && styles.countBubbleSel]}>
                <Text style={[styles.countText, isSel && styles.countTextSel]}>{items.length}</Text>
              </View>
            ) : (
              <View style={styles.countPlaceholder} />
            )}
            <Dots items={items} />
          </Pressable>
        );
      })}
    </View>
  );
});

const MonthGrid = memo(function MonthGrid({
  anchor,
  byDay,
  today,
  selected,
  onSelect,
}: {
  anchor: Date;
  byDay: Map<string, Item[]>;
  today: string;
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const max = Math.max(1, ...cells.map((c) => byDay.get(c.day)?.length ?? 0));
  return (
    <View style={styles.monthCard}>
      <View style={styles.monthHead}>
        {WEEKDAYS_SHORT.map((w) => (
          <Text key={w} style={styles.monthHeadText}>{w.slice(0, 1)}</Text>
        ))}
      </View>
      <View style={styles.monthBody}>
        {cells.map((cell) => {
          const items = cell.inMonth ? byDay.get(cell.day) : undefined;
          const n = items?.length ?? 0;
          const isSel = selected === cell.day;
          const isToday = today === cell.day;
          // Busier days get a stronger teal wash, like a heatmap.
          const heat = n ? 0.08 + 0.32 * (n / max) : 0;
          return (
            <Pressable
              key={cell.day}
              disabled={!cell.inMonth}
              onPress={() => onSelect(isSel ? null : cell.day)}
              accessibilityRole="button"
              accessibilityLabel={`${dayLabel(cell.day)}, ${n} milestones`}
              style={styles.monthCellWrap}
            >
              <View
                style={[
                  styles.monthCell,
                  heat ? { backgroundColor: `rgba(0,181,166,${heat.toFixed(2)})` } : null,
                  isToday && styles.monthToday,
                  isSel && styles.monthSel,
                ]}
              >
                <Text
                  style={[
                    styles.monthNum,
                    !cell.inMonth && styles.monthOut,
                    cell.day < today && cell.inMonth && styles.monthPast,
                    isSel && styles.selText,
                  ]}
                >
                  {cell.date.getDate()}
                </Text>
                {n ? <Dots items={items} /> : <View style={styles.dotsRow} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

function Legend() {
  return (
    <View style={styles.legend}>
      {FILTERS.slice(1).map((f) => (
        <View key={f.kind} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: kindStyle(f.kind).color }]} />
          <Text style={styles.legendText}>{f.label}</Text>
        </View>
      ))}
    </View>
  );
}

const DayHeader = memo(function DayHeader({ day, count, today }: { day: string; count: number; today: string }) {
  const isToday = day === today;
  return (
    <View style={styles.dayHeader}>
      <Text style={[styles.dayHeaderText, isToday && { color: colors.teal }]}>{isToday ? "Today" : dayLabel(day)}</Text>
      <View style={styles.dayRule} />
      <Text style={styles.dayCount}>{count} {count === 1 ? "event" : "events"} · {countdownLabel(day)}</Text>
    </View>
  );
});

const CalendarItemCard = memo(function CalendarItemCard({
  item,
  onCompany,
}: {
  item: Item;
  onCompany: (slug: string) => void;
}) {
  const style = kindStyle(item.kind);
  const d = fromDay(item.date);
  const estimated = item.status === "estimated";
  return (
    <View style={styles.itemCard}>
      <View style={[styles.dateBlock, { backgroundColor: style.soft }]}>
        <Text style={[styles.dateMonth, { color: style.color }]}>
          {MONTH_ABBR[d.getMonth()]}
        </Text>
        <Text style={[styles.dateDay, { color: style.color }]}>{d.getDate()}</Text>
        <Ionicons name={style.icon} size={14} color={style.color} />
      </View>
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <Text style={[styles.kind, { color: style.color }]} numberOfLines={1}>{kindLabel(item.kind).toUpperCase()}</Text>
          <View style={[styles.status, estimated ? styles.estimated : styles.confirmed]}>
            <Ionicons
              name={estimated ? "time-outline" : "checkmark-circle"}
              size={11}
              color={estimated ? colors.amber : colors.green}
            />
            <Text style={[styles.statusText, { color: estimated ? colors.amber : colors.green }]}>
              {estimated ? "Estimated" : item.status === "completed" ? "Completed" : "Confirmed"}
            </Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {!!item.detail && <Text style={styles.detail} numberOfLines={2}>{item.detail}</Text>}
        <View style={styles.actions}>
          {item.company ? (
            <Pressable onPress={() => onCompany(item.company!.slug)} hitSlop={6} style={styles.companyPill}>
              <Ionicons name="business-outline" size={12} color={colors.teal} />
              <Text style={styles.link} numberOfLines={1}>{item.company.canonicalName}</Text>
            </Pressable>
          ) : item.country ? (
            <Text style={styles.country}>{item.country}</Text>
          ) : (
            <View />
          )}
          {!!item.sourceUrl && (
            <Pressable onPress={() => void Linking.openURL(item.sourceUrl)} hitSlop={6} style={styles.sourceRow}>
              <Text style={styles.source}>Source</Text>
              <Ionicons name="open-outline" size={12} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(126,238,222,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: { color: colors.mint, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  heroTitle: { color: colors.white, fontSize: fontSize.xl, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  todayBtn: { paddingHorizontal: 10, height: 32, justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  todayText: { color: colors.white, fontSize: fontSize.xs, fontWeight: "800" },
  segment: { marginTop: spacing.lg },
  filters: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  weekStrip: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 6,
    gap: 4,
    ...shadow,
  },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: 14 },
  weekCellToday: { borderWidth: 1.5, borderColor: colors.tealBright },
  weekCellSel: { backgroundColor: colors.navy },
  past: { opacity: 0.45 },
  weekDayName: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  weekDayNum: { color: colors.navy, fontSize: 18, fontWeight: "800", marginTop: 2 },
  selText: { color: colors.white },
  countBubble: { marginTop: 4, minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: colors.tealSoft, alignItems: "center", justifyContent: "center" },
  countBubbleSel: { backgroundColor: colors.tealBright },
  countText: { color: colors.teal, fontSize: 11, fontWeight: "800" },
  countTextSel: { color: colors.white },
  countPlaceholder: { height: 18, marginTop: 4 },
  dotsRow: { flexDirection: "row", gap: 3, height: 6, marginTop: 4, justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  monthCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
    ...shadow,
  },
  monthHead: { flexDirection: "row", paddingBottom: 4 },
  monthHeadText: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "800" },
  monthBody: { flexDirection: "row", flexWrap: "wrap" },
  monthCellWrap: { width: `${100 / 7}%`, padding: 2 },
  monthCell: { aspectRatio: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  monthToday: { borderWidth: 1.5, borderColor: colors.tealBright },
  monthSel: { backgroundColor: colors.navy },
  monthNum: { color: colors.navy, fontSize: fontSize.sm, fontWeight: "700" },
  monthOut: { color: colors.lineStrong },
  monthPast: { color: colors.placeholder },
  clearDay: { flexDirection: "row", alignItems: "center", gap: 5, marginHorizontal: spacing.lg, marginTop: spacing.md },
  clearDayText: { color: colors.teal, fontSize: fontSize.sm, fontWeight: "700" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 2 },
  dayHeaderText: { color: colors.navy, fontSize: fontSize.md, fontWeight: "800" },
  dayRule: { flex: 1, height: 1, backgroundColor: colors.line },
  dayCount: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  itemCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow,
  },
  dateBlock: { width: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, gap: 1 },
  dateMonth: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  dateDay: { fontSize: 22, fontWeight: "900", lineHeight: 26 },
  itemBody: { flex: 1, minWidth: 0 },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  kind: { flex: 1, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  status: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  confirmed: { backgroundColor: colors.greenSoft },
  estimated: { backgroundColor: colors.amberSoft },
  statusText: { fontSize: 10, fontWeight: "800" },
  title: { color: colors.ink, fontSize: fontSize.md, fontWeight: "800", marginTop: 4, lineHeight: 20 },
  detail: { color: colors.muted, fontSize: fontSize.sm, marginTop: 3, lineHeight: 18 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.sm },
  companyPill: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.tealSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  link: { color: colors.teal, fontSize: fontSize.xs, fontWeight: "800", flexShrink: 1 },
  country: { color: colors.muted, fontSize: fontSize.xs },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  source: { color: colors.muted, fontSize: fontSize.xs, fontWeight: "700" },
});
