"use client";
/**
 * Interactive catalyst calendar (same model as the mobile app):
 *  - Agenda: everything upcoming, grouped by day with countdowns
 *  - Week:   seven day columns side by side
 *  - Month:  a month grid with a heat wash + a day panel
 *
 * Week and month fetch exactly their window from /api/v1/calendar
 * (from/to) and filter kinds in the browser so filter changes are instant.
 * Responses are cached per period and neighbouring periods are prefetched.
 * The view and period are mirrored into the URL (?view=week&date=2026-11-02)
 * so links are shareable.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import { kindLabel, kindStyle, styleVars } from "@/lib/categories";
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
} from "@/lib/calendarDates";

export interface CalendarItem {
  id: string;
  kind: string;
  date: string;
  title: string;
  detail: string;
  status: string;
  sourceUrl: string;
  country: string | null;
  company: { slug: string; canonicalName: string } | null;
}

type ViewMode = "agenda" | "week" | "month";

const VIEWS: Array<{ value: ViewMode; label: string; icon: IconName }> = [
  { value: "agenda", label: "Agenda", icon: "list" },
  { value: "week", label: "Week", icon: "calendar" },
  { value: "month", label: "Month", icon: "grid" },
];

const FILTERS = [
  { label: "All", kind: "" },
  { label: "Trials", kind: "trial_completion" },
  { label: "PDUFA", kind: "pdufa" },
  { label: "Patents", kind: "patent_expiry" },
  { label: "Regulatory", kind: "regulatory_decision" },
];

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type Period = { from: string; to: string; key: string };

function periodFor(view: ViewMode, anchor: Date): Period | null {
  if (view === "week") {
    const s = startOfWeek(anchor);
    return { from: toDay(s), to: toDay(addDays(s, 6)), key: `w:${toDay(s)}` };
  }
  if (view === "month") {
    const s = startOfMonth(anchor);
    return { from: toDay(s), to: toDay(endOfMonth(s)), key: `m:${toDay(s)}` };
  }
  return null;
}

const cache = new Map<string, CalendarItem[]>();
const inflight = new Map<string, Promise<CalendarItem[]>>();

function fetchCalendar(key: string, params: Record<string, string>): Promise<CalendarItem[]> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const req = fetch(`/api/v1/calendar?${new URLSearchParams(params)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Calendar request failed (${r.status})`);
      return r.json() as Promise<{ items: CalendarItem[] }>;
    })
    .then((d) => {
      cache.set(key, d.items);
      return d.items;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, req);
  return req;
}

function periodParams(p: Period) {
  return { from: p.from, to: p.to, limit: "500" };
}

function parseView(v: string | null | undefined): ViewMode {
  return v === "week" || v === "month" ? v : "agenda";
}

function parseDate(d: string | null | undefined): string | null {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function CalendarView({
  initialItems,
  initialView,
  initialDate,
}: {
  initialItems: CalendarItem[];
  initialView?: string;
  initialDate?: string;
}) {
  // View and period are local state mirrored into the URL with
  // history.replaceState: switching is instant (no server round trip) and
  // links stay shareable.
  const [view, setView] = useState<ViewMode>(() => parseView(initialView));
  const [dateParam, setDateParam] = useState<string | null>(() => parseDate(initialDate));
  const anchor = useMemo(() => (dateParam ? fromDay(dateParam) : new Date()), [dateParam]);
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // "Today" depends on the viewer's timezone (servers run on UTC, readers are
  // mostly IST), so date-dependent output renders only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const today = toDay(new Date());

  if (!cache.has("agenda:")) cache.set("agenda:", initialItems);

  const period = periodFor(view, anchor);
  const key = period ? period.key : `agenda:${kind}`;
  const [items, setItems] = useState<CalendarItem[] | null>(() => cache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback(
    (next: { view?: ViewMode; date?: string | null }) => {
      const v = next.view ?? view;
      const d = v === "agenda" || next.date === null ? null : next.date ?? dateParam;
      setView(v);
      setDateParam(d);
      setSelected(null);
      const sp = new URLSearchParams(window.location.search);
      if (v === "agenda") sp.delete("view");
      else sp.set("view", v);
      if (d) sp.set("date", d);
      else sp.delete("date");
      const qs = sp.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    },
    [view, dateParam],
  );

  useEffect(() => {
    let alive = true;
    const hit = cache.get(key);
    if (hit) {
      setItems(hit);
      setError(null);
      return;
    }
    setLoading(true);
    const req = period
      ? fetchCalendar(key, periodParams(period))
      : fetchCalendar(key, { limit: "250", ...(kind ? { kind } : {}) });
    req
      .then((d) => {
        if (alive) {
          setItems(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Prefetch the neighbouring periods so paging is instant.
  useEffect(() => {
    if (!period) return;
    for (const step of [-1, 1]) {
      const n = periodFor(view, view === "week" ? addDays(anchor, 7 * step) : addMonths(anchor, step));
      if (n) void fetchCalendar(n.key, periodParams(n)).catch(() => undefined);
    }
  }, [view, anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const inPeriod = useMemo(() => {
    const list = items ?? [];
    return period ? list.filter((i) => i.date >= period.from && i.date <= period.to) : list;
  }, [items, period?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const m: Record<string, number> = { "": inPeriod.length };
    for (const i of inPeriod) m[i.kind] = (m[i.kind] ?? 0) + 1;
    return m;
  }, [inPeriod]);

  const visible = useMemo(
    () => (period && kind ? inPeriod.filter((i) => i.kind === kind) : inPeriod),
    [inPeriod, kind, period?.key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const byDay = useMemo(() => groupByDay(visible), [visible]);

  // Month view: default the side panel to today (if shown) or the first busy day.
  const monthSelected =
    view === "month"
      ? selected ?? (period && today >= period.from && today <= period.to && byDay.has(today) ? today : [...byDay.keys()][0] ?? null)
      : selected;

  const step = (dir: -1 | 1) =>
    navigate({ date: toDay(view === "week" ? addDays(anchor, 7 * dir) : addMonths(anchor, dir)) });

  const pickDay = (d: string) => {
    setSelected((cur) => (cur === d && view === "week" ? null : d));
    if (view === "week") requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const title = view === "agenda" ? "Upcoming catalysts" : view === "week" ? weekTitle(startOfWeek(anchor)) : monthTitle(anchor);

  return (
    <>
      <section className="cal-hero" aria-labelledby="cal-h">
        <div>
          <span className="cal-kicker">CATALYST CALENDAR</span>
          <h1 id="cal-h">What’s coming up</h1>
          <p>Trial readouts, PDUFA and regulatory dates, patent expiries and disclosed milestones. Estimated dates are labelled.</p>
        </div>
        <div className="segmented" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => navigate({ view: v.value, date: v.value === "week" && dateParam ? toDay(startOfWeek(fromDay(dateParam))) : dateParam })}>
              <Icon name={v.icon} size={15} /> {v.label}
            </button>
          ))}
        </div>
      </section>

      <div className="cal-toolbar">
        <div className="cal-period">
          {view !== "agenda" && (
            <button type="button" className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>
              <Icon name="chevron-left" size={18} />
            </button>
          )}
          <h2 aria-live="polite">{mounted ? title : " "}</h2>
          {view !== "agenda" && (
            <>
              <button type="button" className="icon-btn" aria-label="Next" onClick={() => step(1)}>
                <Icon name="chevron-right" size={18} />
              </button>
              <button type="button" className="btn btn-compact" onClick={() => navigate({ date: null })}>
                Today
              </button>
            </>
          )}
        </div>
        <div className="cal-filters" role="group" aria-label="Filter by milestone type">
          {FILTERS.map((f) => {
            const s = f.kind ? kindStyle(f.kind) : null;
            return (
              <button
                key={f.label}
                type="button"
                className={`chip ${s ? "chip-cat" : ""}`}
                style={s ? styleVars(s) : undefined}
                aria-pressed={kind === f.kind}
                onClick={() => {
                  setKind(f.kind);
                  setSelected(null);
                }}
              >
                <Icon name={s ? s.icon : "grid"} size={14} /> {f.label}
                {period && items && <span className="count">{counts[f.kind] ?? 0}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="cal-legend">
        {FILTERS.slice(1).map((f) => (
          <span key={f.kind} style={styleVars(kindStyle(f.kind))}><i />{f.label}</span>
        ))}
      </div>

      {error && !items ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="alert" size={24} /></span>
          <p>{error}</p>
        </div>
      ) : !items || !mounted ? (
        <div className="agenda">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 86, borderRadius: 16, marginBottom: 8 }} />)}
        </div>
      ) : (
        <div className={loading ? "cal-loading" : undefined}>
          {view === "agenda" && <Agenda byDay={byDay} today={today} />}
          {view === "week" && (
            <>
              <div className="cal-week">
                {weekDays(startOfWeek(anchor)).map((d, i) => {
                  const ds = toDay(d);
                  const list = byDay.get(ds) ?? [];
                  return (
                    <div
                      key={ds}
                      className={`cal-day ${ds === today ? "is-today" : ""} ${ds < today ? "is-past" : ""} ${list.length ? "" : "is-empty"}`}
                    >
                      <div className="cal-day-head">
                        <span>{WEEKDAYS_SHORT[i]}</span>
                        <strong>{d.getDate()}</strong>
                      </div>
                      {list.slice(0, 5).map((it) => {
                        const s = kindStyle(it.kind);
                        return (
                          <button key={it.id} type="button" className="cal-mini" style={styleVars(s)} onClick={() => pickDay(ds)}>
                            <small><Icon name={s.icon} size={11} /> {kindLabel(it.kind)}</small>
                            <strong>{it.title}</strong>
                          </button>
                        );
                      })}
                      {list.length > 5 && (
                        <button type="button" className="cal-more" onClick={() => pickDay(ds)}>
                          +{list.length - 5} more
                        </button>
                      )}
                      {list.length === 0 && <span className="cal-empty-day">No events</span>}
                    </div>
                  );
                })}
              </div>
              <div ref={detailRef}>
                {selected ? (
                  <Agenda byDay={new Map([[selected, byDay.get(selected) ?? []]])} today={today} onClear={() => setSelected(null)} />
                ) : visible.length === 0 ? (
                  <EmptyPeriod label="week" />
                ) : null}
              </div>
            </>
          )}
          {view === "month" && (
            <div className="cal-month-wrap">
              <MonthGrid anchor={anchor} byDay={byDay} today={today} selected={monthSelected} onPick={(d) => setSelected(d)} />
              <aside className="cal-side" aria-live="polite">
                {monthSelected ? (
                  <>
                    <h3>{monthSelected === today ? "Today" : dayLabel(monthSelected)}</h3>
                    <p className="muted" style={{ margin: "0 0 10px" }}>
                      {(byDay.get(monthSelected) ?? []).length} milestone{(byDay.get(monthSelected) ?? []).length === 1 ? "" : "s"} ·{" "}
                      {countdownLabel(monthSelected)}
                    </p>
                    {(byDay.get(monthSelected) ?? []).map((it) => <ItemCard key={it.id} item={it} compact />)}
                    {(byDay.get(monthSelected) ?? []).length === 0 && <p className="muted">Nothing scheduled on this day.</p>}
                  </>
                ) : (
                  <EmptyPeriod label="month" />
                )}
              </aside>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EmptyPeriod({ label }: { label: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="calendar" size={24} /></span>
      <p>No milestones this {label}. Use the arrows to look ahead.</p>
    </div>
  );
}

function Agenda({ byDay, today, onClear }: { byDay: Map<string, CalendarItem[]>; today: string; onClear?: () => void }) {
  if (byDay.size === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Icon name="calendar" size={24} /></span>
        <p>No upcoming milestones match this filter.</p>
      </div>
    );
  }
  return (
    <div className="agenda">
      {[...byDay.entries()].map(([d, list]) => (
        <section key={d} aria-label={dayLabel(d)}>
          <div className="agenda-day">
            <h3 style={d === today ? { color: "var(--teal)" } : undefined}>{d === today ? "Today" : dayLabel(d)}</h3>
            <hr />
            <span>
              {list.length} event{list.length === 1 ? "" : "s"} · {countdownLabel(d)}
            </span>
            {onClear && (
              <button type="button" className="btn btn-compact" onClick={onClear}>
                Close
              </button>
            )}
          </div>
          {list.map((it) => <ItemCard key={it.id} item={it} />)}
        </section>
      ))}
    </div>
  );
}

function ItemCard({ item, compact }: { item: CalendarItem; compact?: boolean }) {
  const s = kindStyle(item.kind);
  const d = fromDay(item.date);
  const estimated = item.status === "estimated";
  return (
    <article className="cal-item" style={styleVars(s)}>
      {!compact && (
        <div className="cal-item-date">
          <small>{MONTH_ABBR[d.getMonth()]}</small>
          <strong>{d.getDate()}</strong>
        </div>
      )}
      <div className="cal-item-body">
        <div className="cal-item-top">
          <span className="cal-item-kind"><Icon name={s.icon} size={13} /> {kindLabel(item.kind)}</span>
          <span className={`status-pill ${estimated ? "status-estimated" : "status-confirmed"}`}>
            <Icon name={estimated ? "clock" : "check-circle"} size={11} />
            {estimated ? "Estimated" : item.status === "completed" ? "Completed" : "Confirmed"}
          </span>
        </div>
        <h4>{item.title}</h4>
        {item.detail && <p>{item.detail}</p>}
        <div className="cal-item-links">
          {item.company && (
            <Link href={`/companies/${item.company.slug}`}>
              <Icon name="building" size={13} /> {item.company.canonicalName}
            </Link>
          )}
          {item.country && !item.company && <span className="muted">{item.country}</span>}
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              Source <Icon name="external" size={12} />
            </a>
          )}
        </div>
      </div>
      {!compact && <span className="cal-item-when">{countdownLabel(item.date)}</span>}
    </article>
  );
}

function MonthGrid({
  anchor,
  byDay,
  today,
  selected,
  onPick,
}: {
  anchor: Date;
  byDay: Map<string, CalendarItem[]>;
  today: string;
  selected: string | null;
  onPick: (d: string) => void;
}) {
  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const max = Math.max(1, ...cells.map((c) => (c.inMonth ? byDay.get(c.day)?.length ?? 0 : 0)));
  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {WEEKDAYS_SHORT.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="cal-month-grid">
        {cells.map((c) => {
          const list = c.inMonth ? byDay.get(c.day) ?? [] : [];
          const n = list.length;
          const heat = n ? 0.06 + 0.26 * (n / max) : 0;
          const cls = [
            "cal-cell",
            !c.inMonth && "is-out",
            c.day === today && "is-today",
            c.day === selected && "is-selected",
            c.day < today && "is-past",
            n && "cal-heat",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={c.day}
              type="button"
              className={cls}
              disabled={!c.inMonth}
              style={n ? ({ "--h": heat.toFixed(2) } as CSSProperties) : undefined}
              onClick={() => onPick(c.day)}
              aria-label={`${dayLabel(c.day)}, ${n} milestones`}
              aria-pressed={c.day === selected}
            >
              <span className="cal-num">
                {c.date.getDate()}
                {n > 0 && <em>{n}</em>}
              </span>
              {list.slice(0, 2).map((it) => (
                <span key={it.id} className="cal-pill" style={styleVars(kindStyle(it.kind))}>
                  {it.title}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
