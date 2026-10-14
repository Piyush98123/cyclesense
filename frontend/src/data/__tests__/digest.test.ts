import { computeChargingHabits, computeDigest, describeChargingHabits, formatHabitHour } from "@/src/data/digest";
import { daysAgoIso, mkSession } from "./fixtures";

describe("computeDigest - period windows", () => {
  it("5day: averages the last 5 days and compares against the prior 5 days", () => {
    const sessions = [
      mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(0.5) }),
      mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(1.5) }),
      mkSession({ mode: "discharge", rate: 8, startAt: daysAgoIso(6) }),
      mkSession({ mode: "discharge", rate: 8, startAt: daysAgoIso(7) }),
      mkSession({ mode: "discharge", rate: 8, startAt: daysAgoIso(8) }),
    ];
    const digest = computeDigest(sessions, "5day");
    expect(digest.averageDrain).toBe(10);
    expect(digest.trend.direction).toBe("up"); // drain got faster vs prior period
    expect(digest.trend.deltaPercent).toBe(25); // (10-8)/8 * 100
  });

  it("daily: only counts sessions from the last 24 hours", () => {
    const sessions = [
      mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(0.5) }),
      mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(1.5) }),
    ];
    const digest = computeDigest(sessions, "daily");
    expect(digest.totalSessions).toBe(1);
  });

  it("defaults to the daily period when none is given", () => {
    const sessions = [mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(0.5) })];
    expect(computeDigest(sessions)).toEqual(computeDigest(sessions, "daily"));
  });

  it("trend is flat when there isn't a prior period to compare against", () => {
    const sessions = [mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(0.5) })];
    const digest = computeDigest(sessions, "5day");
    expect(digest.trend).toEqual({ direction: "flat", deltaPercent: null });
  });

  it("a small change under the flat-threshold reports as flat, not up/down", () => {
    const sessions = [
      mkSession({ mode: "discharge", rate: 10.2, startAt: daysAgoIso(0.5) }),
      mkSession({ mode: "discharge", rate: 10, startAt: daysAgoIso(6) }),
    ];
    const digest = computeDigest(sessions, "5day");
    expect(digest.trend.direction).toBe("flat");
  });

  it("only counts closed sessions toward totalMAh and totalSessions", () => {
    const sessions = [
      mkSession({ mode: "discharge", endAt: null, mAhDelta: 500, startAt: daysAgoIso(0.1) }),
      mkSession({ mode: "discharge", mAhDelta: 300, startAt: daysAgoIso(0.2) }),
      mkSession({ mode: "charge", mAhDelta: 2000, startAt: daysAgoIso(0.3) }),
    ];
    const digest = computeDigest(sessions, "daily");
    expect(digest.totalSessions).toBe(2);
    expect(digest.totalMAh).toBe(300);
  });

  it("averages completed charge-session durations regardless of start and end level", () => {
    const sessions = [
      mkSession({ mode: "charge", startLevel: 63, endLevel: 89, durationMinutes: 90, startAt: daysAgoIso(0.2) }),
      mkSession({ mode: "charge", endAt: null, durationMinutes: 180, startAt: daysAgoIso(0.1) }),
    ];
    expect(computeDigest(sessions, "daily").averageChargeMinutes).toBe(90);
  });
});

describe("computeChargingHabits", () => {
  it("returns nulls with no charge sessions in the window", () => {
    const habits = computeChargingHabits([mkSession({ mode: "discharge" })]);
    expect(habits.avgStartPercent).toBeNull();
    expect(habits.typicalStartHour).toBeNull();
    expect(habits.overnightCount).toBe(0);
  });

  it("computes average start/end percent across charge sessions", () => {
    const sessions = [
      mkSession({ mode: "charge", startLevel: 20, endLevel: 80, startAt: daysAgoIso(1) }),
      mkSession({ mode: "charge", startLevel: 30, endLevel: 90, startAt: daysAgoIso(2) }),
    ];
    const habits = computeChargingHabits(sessions);
    expect(habits.avgStartPercent).toBe(25);
    expect(habits.avgEndPercent).toBe(85);
  });

  it("counts a long late-night session as overnight, but not a short late top-up", () => {
    const lateNight = new Date();
    lateNight.setHours(23, 0, 0, 0);
    const sessions = [
      mkSession({ mode: "charge", startAt: lateNight.toISOString(), durationMinutes: 240 }), // overnight
      mkSession({ mode: "charge", startAt: lateNight.toISOString(), durationMinutes: 10 }), // too short
    ];
    const habits = computeChargingHabits(sessions);
    expect(habits.overnightCount).toBe(1);
  });

  it("does not count a daytime long session as overnight", () => {
    const midday = new Date();
    midday.setHours(14, 0, 0, 0);
    const sessions = [mkSession({ mode: "charge", startAt: midday.toISOString(), durationMinutes: 240 })];
    const habits = computeChargingHabits(sessions);
    expect(habits.overnightCount).toBe(0);
  });
});

describe("formatHabitHour / describeChargingHabits", () => {
  it("formats hours into 12-hour clock labels", () => {
    expect(formatHabitHour(0)).toBe("12AM");
    expect(formatHabitHour(13)).toBe("1PM");
    expect(formatHabitHour(23)).toBe("11PM");
    expect(formatHabitHour(null)).toBe("—");
  });

  it("describes habits in neutral, factual language - never a judgment", () => {
    const summary = describeChargingHabits({
      avgStartPercent: 22,
      avgEndPercent: 91,
      sessionsPerDay: 1.5,
      overnightCount: 3,
      typicalStartHour: 23,
    });
    expect(summary).toContain("22%");
    expect(summary).toContain("91%");
    expect(summary).toContain("11PM");
    expect(summary).toMatch(/overnight 3 times/i);
    // "Information, not accusation" - must not editorialize.
    expect(summary?.toLowerCase()).not.toMatch(/damag|bad|unhealthy|shouldn't|warning/);
  });

  it("returns null when there's no charging data yet", () => {
    expect(describeChargingHabits({ avgStartPercent: null, avgEndPercent: null, sessionsPerDay: null, overnightCount: 0, typicalStartHour: null })).toBeNull();
  });
});
