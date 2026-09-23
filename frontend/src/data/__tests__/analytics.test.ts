import {
  baselineDeviation,
  computeBaseline,
  computeMAhDelta,
  describeDrainDeviation,
  estimateChargeTimeToTarget,
  estimateTimeToFull,
  estimateTimeToTarget,
  estimateWatts,
  isAnomaly,
} from "@/src/data/analytics";
import { mkSample, mkSession } from "./fixtures";

describe("estimateChargeTimeToTarget - taper-aware projection", () => {
  // Charging at 1%/min (fast phase), currently at 50%.
  const fastPhaseSamples = [mkSample(0, 45), mkSample(5 * 60000, 50)];

  it("projects MORE time than a naive linear estimate when the target crosses the 80% taper boundary", () => {
    // Naive linear would say (100-50)/1 = 50 minutes flat, ignoring taper.
    const result = estimateChargeTimeToTarget(fastPhaseSamples, 50, 100);
    expect(result).not.toBeNull();
    expect(result!.minutes).toBeGreaterThan(50);
    expect(result!.crossesTaper).toBe(true);
  });

  it("uses plain linear projection when the whole range stays below 80%", () => {
    const result = estimateChargeTimeToTarget(fastPhaseSamples, 50, 70);
    expect(result).toEqual({ minutes: 20, crossesTaper: false });
  });

  it("does not double-derate a rate that's already observed inside the taper zone", () => {
    // Observed rate here is already the slow, tapered rate (2%/5min = 0.4%/min).
    const inTaperSamples = [mkSample(0, 83), mkSample(5 * 60000, 85)];
    const result = estimateChargeTimeToTarget(inTaperSamples, 85, 95);
    expect(result).not.toBeNull();
    expect(result!.crossesTaper).toBe(false);
    expect(result!.minutes).toBe(25); // (95-85) / 0.4%-per-min
  });

  it("returns zero minutes when the target is already reached", () => {
    const result = estimateChargeTimeToTarget(fastPhaseSamples, 90, 80);
    expect(result).toEqual({ minutes: 0, crossesTaper: false });
  });

  it("returns null when there aren't enough samples to derive a rate", () => {
    expect(estimateChargeTimeToTarget([mkSample(0, 50)], 50, 100)).toBeNull();
    expect(estimateChargeTimeToTarget([], 50, 100)).toBeNull();
  });

  it("returns null when the recent samples show no positive charge rate", () => {
    const flatSamples = [mkSample(0, 50), mkSample(60000, 50)];
    expect(estimateChargeTimeToTarget(flatSamples, 50, 100)).toBeNull();
  });
});

describe("estimateTimeToFull / estimateTimeToTarget - thin wrappers", () => {
  const samples = [mkSample(0, 45), mkSample(5 * 60000, 50)];

  it("estimateTimeToFull returns 0 at 100%", () => {
    expect(estimateTimeToFull(samples, 100)).toBe(0);
  });

  it("estimateTimeToFull and estimateChargeTimeToTarget(...,100) never disagree", () => {
    const viaWrapper = estimateTimeToFull(samples, 50);
    const viaCore = estimateChargeTimeToTarget(samples, 50, 100);
    expect(viaWrapper).toBe(viaCore!.minutes);
  });

  it("estimateTimeToTarget returns 0 once the target is already passed", () => {
    expect(estimateTimeToTarget(samples, 92, 90)).toBe(0);
  });
});

describe("estimateWatts", () => {
  it("computes watts from microamps and millivolts", () => {
    // 1.85A * 4.0V = 7.4W
    expect(estimateWatts(1850000, 4000)).toBe(7.4);
  });

  it("uses the magnitude of current, regardless of charge/discharge sign", () => {
    expect(estimateWatts(-1850000, 4000)).toBe(7.4);
  });

  it("returns null when either input is missing or voltage is non-positive", () => {
    expect(estimateWatts(null, 4000)).toBeNull();
    expect(estimateWatts(1000000, null)).toBeNull();
    expect(estimateWatts(1000000, 0)).toBeNull();
  });
});

describe("computeMAhDelta", () => {
  it("computes the drawn mAh from a charge-counter drop", () => {
    expect(computeMAhDelta(3000000, 2500000)).toBe(500);
  });

  it("returns null when the counter went up instead of down (not a discharge)", () => {
    expect(computeMAhDelta(2500000, 3000000)).toBeNull();
  });

  it("returns null when either reading is missing or non-positive", () => {
    expect(computeMAhDelta(null, 2500000)).toBeNull();
    expect(computeMAhDelta(3000000, null)).toBeNull();
    expect(computeMAhDelta(0, 2500000)).toBeNull();
  });
});

describe("computeBaseline / baselineDeviation / isAnomaly", () => {
  it("averages discharge rates within the last 7 days", () => {
    const sessions = [
      mkSession({ mode: "discharge", rate: 10, startAt: new Date().toISOString() }),
      mkSession({ mode: "discharge", rate: 20, startAt: new Date().toISOString() }),
    ];
    expect(computeBaseline(sessions)).toBe(15);
  });

  it("returns null with fewer than 2 qualifying sessions", () => {
    expect(computeBaseline([mkSession({ mode: "discharge", rate: 10 })])).toBeNull();
    expect(computeBaseline([])).toBeNull();
  });

  it("ignores charge sessions and sessions outside the 7-day window", () => {
    const sessions = [
      mkSession({ mode: "charge", rate: 999 }),
      mkSession({ mode: "discharge", rate: 10, startAt: new Date(Date.now() - 30 * 86400000).toISOString() }),
      mkSession({ mode: "discharge", rate: 10 }),
      mkSession({ mode: "discharge", rate: 20 }),
    ];
    expect(computeBaseline(sessions)).toBe(15);
  });

  it("flags a session as anomalous only past the 20% deviation threshold", () => {
    expect(isAnomaly(baselineDeviation(11, 10))).toBe(false); // +10% - below threshold
    expect(isAnomaly(baselineDeviation(12, 10))).toBe(true); // +20% exactly - meets ">= 20" threshold
    expect(isAnomaly(25)).toBe(true);
    expect(isAnomaly(-25)).toBe(true);
    expect(isAnomaly(5)).toBe(false);
    expect(isAnomaly(null)).toBe(false);
  });

  it("describeDrainDeviation gives a plain sentence that names the direction", () => {
    const faster = describeDrainDeviation(30, 10);
    expect(faster).toMatch(/faster/i);
    const slower = describeDrainDeviation(-30, 10);
    expect(slower).toMatch(/slower/i);
    expect(describeDrainDeviation(2, 10)).toMatch(/same/i);
    expect(describeDrainDeviation(null, 10)).toBeNull();
  });
});
