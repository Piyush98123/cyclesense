import {
  computeWeekdayWeekendPattern,
  computeWeeklyAppRanking,
  countWeekdayWeekendDays,
  describeWeekdayWeekendPattern,
} from "@/src/data/screen-time";
import type { NativeUsageStat } from "@/modules/cyclesense-native/src";

// Jan 1, 2024 was a Monday; Jan 6, 2024 was a Saturday. Using fixed
// real-calendar dates (rather than dates relative to "now") makes the
// day-of-week classification fully deterministic regardless of when this
// test suite actually runs.
const MONDAY = new Date("2024-01-01T10:00:00Z").getTime();
const TUESDAY = new Date("2024-01-02T10:00:00Z").getTime();
const SATURDAY = new Date("2024-01-06T10:00:00Z").getTime();
const SUNDAY = new Date("2024-01-07T10:00:00Z").getTime();

function mkStat(overrides: Partial<NativeUsageStat> = {}): NativeUsageStat {
  return {
    packageName: "com.example.app",
    label: "Example App",
    totalTimeForegroundMs: 0,
    firstTimeStampMs: MONDAY,
    lastTimeStampMs: MONDAY,
    lastTimeUsedMs: MONDAY,
    ...overrides,
  };
}

describe("computeWeeklyAppRanking", () => {
  it("sums multiple daily-bucket entries for the same app into one total", () => {
    const stats = [
      mkStat({ packageName: "a", label: "App A", totalTimeForegroundMs: 30 * 60000, lastTimeStampMs: MONDAY }),
      mkStat({ packageName: "a", label: "App A", totalTimeForegroundMs: 45 * 60000, lastTimeStampMs: TUESDAY }),
    ];
    const ranking = computeWeeklyAppRanking(stats);
    expect(ranking).toEqual([{ packageName: "a", label: "App A", totalMinutes: 75 }]);
  });

  it("sorts by total descending and respects topN", () => {
    const stats = [
      mkStat({ packageName: "small", label: "Small", totalTimeForegroundMs: 10 * 60000 }),
      mkStat({ packageName: "big", label: "Big", totalTimeForegroundMs: 100 * 60000 }),
      mkStat({ packageName: "medium", label: "Medium", totalTimeForegroundMs: 50 * 60000 }),
    ];
    const ranking = computeWeeklyAppRanking(stats, 2);
    expect(ranking.map((r) => r.packageName)).toEqual(["big", "medium"]);
  });

  it("ignores zero or negative foreground time entries", () => {
    const stats = [mkStat({ packageName: "idle", totalTimeForegroundMs: 0 })];
    expect(computeWeeklyAppRanking(stats)).toEqual([]);
  });

  it("falls back to the package name when no label is present", () => {
    const stats = [mkStat({ packageName: "com.unlabeled", label: "", totalTimeForegroundMs: 60000 })];
    expect(computeWeeklyAppRanking(stats)[0].label).toBe("com.unlabeled");
  });
});

describe("countWeekdayWeekendDays", () => {
  it("any 7 consecutive calendar days always split 5 weekdays / 2 weekend days", () => {
    expect(countWeekdayWeekendDays(7)).toEqual({ weekdayDays: 5, weekendDays: 2 });
  });
});

describe("computeWeekdayWeekendPattern", () => {
  it("classifies entries by their own timestamp and averages over a 5/2 day split", () => {
    const stats = [
      mkStat({ totalTimeForegroundMs: 200 * 60000, lastTimeStampMs: MONDAY }), // weekday
      mkStat({ totalTimeForegroundMs: 200 * 60000, lastTimeStampMs: TUESDAY }), // weekday
      mkStat({ totalTimeForegroundMs: 120 * 60000, lastTimeStampMs: SATURDAY }), // weekend
      mkStat({ totalTimeForegroundMs: 120 * 60000, lastTimeStampMs: SUNDAY }), // weekend
    ];
    const pattern = computeWeekdayWeekendPattern(stats, 7);
    // weekday total 400min / 5 weekdays = 80; weekend total 240min / 2 weekend days = 120
    expect(pattern.weekdayAvgMinutes).toBe(80);
    expect(pattern.weekendAvgMinutes).toBe(120);
  });

  it("returns null averages with no usage data", () => {
    expect(computeWeekdayWeekendPattern([], 7)).toEqual({ weekdayAvgMinutes: null, weekendAvgMinutes: null });
  });

  it("falls back to firstTimeStampMs when lastTimeStampMs is missing", () => {
    const stats = [mkStat({ totalTimeForegroundMs: 100 * 60000, lastTimeStampMs: 0, firstTimeStampMs: SATURDAY })];
    const pattern = computeWeekdayWeekendPattern(stats, 7);
    expect(pattern.weekendAvgMinutes).toBe(50); // 100min / 2 weekend days
    expect(pattern.weekdayAvgMinutes).toBe(0);
  });
});

describe("describeWeekdayWeekendPattern", () => {
  it("names both figures when both are available", () => {
    const summary = describeWeekdayWeekendPattern({ weekdayAvgMinutes: 200, weekendAvgMinutes: 285 });
    expect(summary).toContain("3h 20m");
    expect(summary).toContain("4h 45m");
    expect(summary).toMatch(/weekdays/i);
    expect(summary).toMatch(/weekend/i);
  });

  it("returns null when there is no data at all", () => {
    expect(describeWeekdayWeekendPattern({ weekdayAvgMinutes: null, weekendAvgMinutes: null })).toBeNull();
  });
});