/**
 * Pure date helpers for the catalyst calendar's week and month views.
 * Calendar dates are plain "YYYY-MM-DD" days, so everything works on local
 * calendar days and never converts through UTC timestamps.
 */

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local Date -> "YYYY-MM-DD". */
export function toDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "YYYY-MM-DD" (or a longer ISO string) -> local Date at midnight. */
export function fromDay(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(d, -offset);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** The 7 days of the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Month grid as full Monday-first weeks. Cells outside the month are
 * included (so the grid is rectangular) and flagged with `inMonth: false`.
 */
export function monthGrid(month: Date): Array<{ date: Date; day: string; inMonth: boolean }> {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const cells: Array<{ date: Date; day: string; inMonth: boolean }> = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    cells.push({ date: d, day: toDay(d), inMonth: d.getMonth() === first.getMonth() });
  }
  return cells;
}

export function monthTitle(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "3 – 9 Nov 2026" or "28 Oct – 3 Nov 2026". */
export function weekTitle(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const left = sameMonth ? `${weekStart.getDate()}` : `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]}`;
  return `${left} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
}

/** "Wed 4 Nov" style label for a day header. */
export function dayLabel(day: string): string {
  const d = fromDay(day);
  return `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Whole days from `today` to `day` (0 = today, negative = past). */
export function daysUntil(day: string, today: Date = new Date()): number {
  const a = fromDay(toDay(today)).getTime();
  const b = fromDay(day).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Friendly countdown: "Today", "Tomorrow", "In 5 days", "In 3 wks". */
export function countdownLabel(day: string, today: Date = new Date()): string {
  const n = daysUntil(day, today);
  if (n < 0) return "Passed";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 14) return `In ${n} days`;
  if (n < 60) return `In ${Math.round(n / 7)} wks`;
  return `In ${Math.round(n / 30)} mo`;
}

/** Group items by their `date` day, keeping input order inside each day. */
export function groupByDay<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.date.slice(0, 10);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
