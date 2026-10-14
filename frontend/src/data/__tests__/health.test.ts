import { computeBatteryHealth, computeHealthTrend, estimateCurrentCapacity } from "@/src/data/health";
import { daysAgoIso, mkSession } from "./fixtures";

describe("estimateCurrentCapacity", () => {
  it("normalizes mAhDelta to a full 0-100% equivalent and averages recent sessions", () => {
    const sessions = [
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(1) }), // 50% drop -> 2700mAh
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(2) }), // 2700mAh
    ];
    const estimate = estimateCurrentCapacity(sessions);
    expect(estimate.estimatedMah).toBe(2700);
    expect(estimate.sampleCount).toBe(2);
  });

  it("excludes short sessions where the percent drop is too small to trust", () => {
    const sessions = [mkSession({ mode: "discharge", startLevel: 90, endLevel: 85, mAhDelta: 150 })]; // only 5% drop
    expect(estimateCurrentCapacity(sessions)).toEqual({ estimatedMah: null, sampleCount: 0 });
  });

  it("ignores charge sessions and sessions without a computed mAhDelta", () => {
    const sessions = [
      mkSession({ mode: "charge", startLevel: 20, endLevel: 90, mAhDelta: 2000 }),
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: null }),
    ];
    expect(estimateCurrentCapacity(sessions)).toEqual({ estimatedMah: null, sampleCount: 0 });
  });

  it("only uses the most recent 10 qualifying sessions", () => {
    const sessions = Array.from({ length: 15 }, (_, i) =>
      mkSession({
        mode: "discharge",
        startLevel: 90,
        endLevel: 40,
        mAhDelta: i < 10 ? 1500 : 1000, // most recent 10 are index 0-9 after sort by recency
        startAt: daysAgoIso(i),
      }),
    );
    const estimate = estimateCurrentCapacity(sessions);
    expect(estimate.sampleCount).toBe(10);
    expect(estimate.estimatedMah).toBe(3000); // 1500 / 50 * 100, from the 10 most recent
  });
});

describe("computeBatteryHealth", () => {
  it("computes a percentage against design capacity, with High confidence at 5+ samples", () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(i) }),
    );
    const health = computeBatteryHealth(sessions, 3000);
    expect(health.healthPercent).toBe(90); // 2700/3000
    expect(health.confidence).toBe("High");
    expect(health.sampleCount).toBe(5);
  });

  it("reports Medium confidence at 2-4 samples and Low below that", () => {
    const twoSessions = [
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(1) }),
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(2) }),
    ];
    expect(computeBatteryHealth(twoSessions, 3000).confidence).toBe("Medium");
  });

  it("caps the health percentage at 100 even if the estimate exceeds design capacity", () => {
    const sessions = [mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 2000, startAt: daysAgoIso(1) })];
    const health = computeBatteryHealth(sessions, 3000);
    expect(health.healthPercent).toBeLessThanOrEqual(100);
  });

  it("returns null with no design capacity available on this device", () => {
    const sessions = [mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350 })];
    expect(computeBatteryHealth(sessions, null)).toEqual({ healthPercent: null, confidence: "Low", sampleCount: 0 });
    expect(computeBatteryHealth(sessions, undefined)).toEqual({ healthPercent: null, confidence: "Low", sampleCount: 0 });
  });

  it("returns null with no qualifying discharge history yet", () => {
    expect(computeBatteryHealth([], 3000)).toEqual({ healthPercent: null, confidence: "Low", sampleCount: 0 });
  });
});

describe("computeHealthTrend", () => {
  it("shows a declining trend across chronological buckets as capacity degrades", () => {
    const sessions = [
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1455, startAt: daysAgoIso(60) }), // 2910mAh -> 97%
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1455, startAt: daysAgoIso(55) }), // 97%
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(10) }), // 2700mAh -> 90%
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(5) }),  // 90%
    ];
    const trend = computeHealthTrend(sessions, 3000, 2);
    expect(trend.length).toBeGreaterThan(0);
    expect(trend[0]).toBeGreaterThanOrEqual(trend[trend.length - 1]);
    expect(trend[trend.length - 1]).toBe(90);
  });

  it("returns an empty array with fewer than 2 qualifying sessions", () => {
    expect(computeHealthTrend([mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350 })], 3000)).toEqual([]);
  });

  it("excludes discharge sessions older than the 30-day trend window", () => {
    const sessions = [
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1455, startAt: daysAgoIso(60) }),
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1455, startAt: daysAgoIso(55) }),
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(5) }),
    ];
    expect(computeHealthTrend(sessions, 3000)).toEqual([]);
  });

  it("returns an empty array with no design capacity", () => {
    const sessions = [
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(1) }),
      mkSession({ mode: "discharge", startLevel: 90, endLevel: 40, mAhDelta: 1350, startAt: daysAgoIso(2) }),
    ];
    expect(computeHealthTrend(sessions, null)).toEqual([]);
  });
});
