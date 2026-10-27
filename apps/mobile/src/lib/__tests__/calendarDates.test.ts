import {
  countdownLabel,
  groupByDay,
  monthGrid,
  startOfWeek,
  toDay,
  weekDays,
  weekTitle,
  fromDay,
} from "../calendarDates";

describe("calendarDates", () => {
  it("starts weeks on Monday", () => {
    expect(toDay(startOfWeek(fromDay("2026-10-27")))).toBe("2026-10-26"); // Tue -> Mon
    expect(toDay(startOfWeek(fromDay("2026-11-01")))).toBe("2026-10-26"); // Sun -> Mon
    expect(weekDays(fromDay("2026-10-26")).map(toDay)).toHaveLength(7);
  });

  it("builds a rectangular Monday-first month grid", () => {
    const grid = monthGrid(fromDay("2026-11-15"));
    expect(grid.length % 7).toBe(0);
    expect(grid[0].day).toBe("2026-10-26");
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid.at(-1)!.day).toBe("2026-12-06");
  });

  it("formats week titles across months", () => {
    expect(weekTitle(fromDay("2026-11-02"))).toBe("2 – 8 Nov 2026");
    expect(weekTitle(fromDay("2026-10-26"))).toBe("26 Oct – 1 Nov 2026");
  });

  it("labels countdowns", () => {
    const today = fromDay("2026-10-27");
    expect(countdownLabel("2026-10-27", today)).toBe("Today");
    expect(countdownLabel("2026-10-28", today)).toBe("Tomorrow");
    expect(countdownLabel("2026-11-03", today)).toBe("In 7 days");
    expect(countdownLabel("2026-11-24", today)).toBe("In 4 wks");
  });

  it("groups items by day in order", () => {
    const g = groupByDay([
      { date: "2026-11-01", id: "a" },
      { date: "2026-11-02", id: "b" },
      { date: "2026-11-01", id: "c" },
    ]);
    expect([...g.keys()]).toEqual(["2026-11-01", "2026-11-02"]);
    expect(g.get("2026-11-01")!.map((x) => x.id)).toEqual(["a", "c"]);
  });
});
