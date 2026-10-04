import { Session } from "@/src/data/cyclesense";
import type { NativeBatteryTelemetry } from "@/modules/cyclesense-native/src";

const BASELINE_DAYS = 7;
const ANOMALY_THRESHOLD_PERCENT = 20;

/**
 * Rolling 7-day baseline drain rate (%/hr) from finished discharge sessions.
 * Returns null when there aren't enough sessions to be meaningful.
 */
export function computeBaseline(sessions: Session[]): number | null {
  const cutoff = Date.now() - BASELINE_DAYS * 24 * 60 * 60 * 1000;
  const dischargeRates = sessions
    .filter((s) => s.mode === "discharge" && s.endAt !== null && s.rate !== null && new Date(s.startAt).getTime() >= cutoff)
    .map((s) => s.rate as number)
    .filter((r) => r > 0);
  if (dischargeRates.length < 2) return null;
  const sum = dischargeRates.reduce((a, b) => a + b, 0);
  return Number((sum / dischargeRates.length).toFixed(2));
}

/**
 * Signed percent deviation of a session's rate against the baseline (positive
 * means faster drain than usual, negative means better).
 */
export function baselineDeviation(rate: number | null, baseline: number | null): number | null {
  if (rate === null || baseline === null || baseline <= 0) return null;
  return Number((((rate - baseline) / baseline) * 100).toFixed(1));
}

export function isAnomaly(deviation: number | null): boolean {
  if (deviation === null) return false;
  return Math.abs(deviation) >= ANOMALY_THRESHOLD_PERCENT;
}

/**
 * "Why did my battery drain?" — turns the anomaly figure into a plain-language
 * sentence rather than a bare percentage. Deliberately conservative: it only
 * ever compares against the rolling baseline (already computed), so it never
 * claims a specific cause — just how this session compares to normal.
 */
export function describeDrainDeviation(deviation: number | null, baseline: number | null): string | null {
  if (deviation === null || baseline === null) return null;
  const magnitude = Math.abs(deviation);
  if (magnitude < 8) return "About the same as your usual drain rate.";
  const direction = deviation > 0 ? "faster" : "slower";
  const roundedMagnitude = Math.round(magnitude);
  const severity = magnitude >= ANOMALY_THRESHOLD_PERCENT ? "notably" : "somewhat";
  return `This session drained ${severity} ${direction} than usual — about ${roundedMagnitude}% ${direction} than your ${BASELINE_DAYS}-day average.`;
}

/**
 * BatteryManager current readings are legitimately negative during
 * discharge, so "negative" can't mean "invalid" here the way it does for
 * voltage/charge-counter. Android's own docs say an unsupported property
 * returns Integer.MIN_VALUE - which the native side already guards - but
 * some OEMs return -1 instead, against spec. This treats both known
 * sentinels (and anything implausibly large in magnitude) as unavailable,
 * while still passing through any real reading, discharge included.
 */
export function isRealCurrentReading(microAmps: number): boolean {
  if (microAmps === 0) return false;
  if (microAmps === -1) return false; // some OEMs use this instead of the documented Int.MIN_VALUE
  if (Math.abs(microAmps) > 20_000_000) return false; // implausible for a phone battery (>20A) - almost certainly a raw sentinel
  return true;
}

const TAPER_START_PERCENT = 80;
// Heuristic, not measured per-device: li-ion charging tapers hard in the
// constant-voltage phase after ~80%, so the last stretch charges markedly
// slower than the constant-current phase before it. 0.4 means "assume the
// taper phase charges at 40% of the pre-taper rate" - conservative enough to
// avoid the old bug (a fast early rate projected linearly all the way to
// 100%, which was always an underestimate), without needing real per-device
// curve data we don't have.
const TAPER_RATE_FACTOR = 0.4;

// A rate computed from a barely-changed recent window is technically
// positive but statistically meaningless - it happens most often right
// after plugging in, or mid-trickle, when the last few samples haven't
// moved much yet. Extrapolating that noise out to "hours remaining"
// produces a wildly wrong-looking number instead of an honest "not enough
// signal yet." Below this, the rate function returns null (matching the
// existing MIN_PERCENT_DROP_FOR_ESTIMATE guard the battery-health estimate
// already uses for the same reason).
const MIN_PERCENT_DELTA_FOR_RATE = 2;

export type ChargeProjection = {
  minutes: number;
  /** True when the projection had to model the post-80% slowdown, i.e. the
   *  estimate is a heuristic blend rather than a plain rate extrapolation. */
  crossesTaper: boolean;
};

function recentChargeRatePerMinute(
  samples: NativeBatteryTelemetry[] | null | undefined,
  windowSize: number,
): number | null {
  if (!samples || samples.length < 2) return null;
  const recent = samples.slice(-windowSize).filter((s) => s.levelPercent >= 0);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const deltaLevel = last.levelPercent - first.levelPercent;
  const deltaMs = last.timestamp - first.timestamp;
  if (deltaLevel < MIN_PERCENT_DELTA_FOR_RATE || deltaMs <= 0) return null;
  return deltaLevel / (deltaMs / 60000);
}

/**
 * Core shared projection: how long from currentLevelPercent to targetPercent,
 * given the recently observed charge rate. Both estimateTimeToFull and
 * estimateTimeToTarget are thin wrappers over this, so time-to-100% and
 * time-to-your-alert-threshold can never silently drift apart or duplicate
 * the same (buggy) linear-extrapolation logic independently.
 */
export function estimateChargeTimeToTarget(
  samples: NativeBatteryTelemetry[] | null | undefined,
  currentLevelPercent: number,
  targetPercent: number,
  windowSize: number = 6,
): ChargeProjection | null {
  const target = Math.min(100, targetPercent);
  if (target <= currentLevelPercent) return { minutes: 0, crossesTaper: false };

  const perMinute = recentChargeRatePerMinute(samples, windowSize);
  if (perMinute === null || perMinute <= 0) return null;

  if (currentLevelPercent >= TAPER_START_PERCENT || target <= TAPER_START_PERCENT) {
    // Either already charging in the tapered zone (recent rate already
    // reflects that), or the whole projection stays below the taper
    // boundary - a plain linear projection is accurate in both cases.
    return { minutes: Math.round((target - currentLevelPercent) / perMinute), crossesTaper: false };
  }

  // Straddles the taper boundary: fast constant-current rate up to 80%, then
  // a deliberately-derated rate from 80% to the target.
  const fastPortionMinutes = (TAPER_START_PERCENT - currentLevelPercent) / perMinute;
  const taperedRate = perMinute * TAPER_RATE_FACTOR;
  const taperPortionMinutes = (target - TAPER_START_PERCENT) / taperedRate;
  return { minutes: Math.round(fastPortionMinutes + taperPortionMinutes), crossesTaper: true };
}

/**
 * Estimate the minutes remaining to reach 100% charge. Same signature as
 * before this fix, so every existing caller keeps working - only the
 * accuracy near the 80%+ taper zone changed (it no longer systematically
 * underestimates by projecting the fast pre-taper rate all the way to 100%).
 */
export function estimateTimeToFull(
  samples: NativeBatteryTelemetry[] | null | undefined,
  currentLevelPercent: number,
  windowSize: number = 6,
): number | null {
  if (currentLevelPercent >= 100) return 0;
  const projection = estimateChargeTimeToTarget(samples, currentLevelPercent, 100, windowSize);
  return projection ? projection.minutes : null;
}

/**
 * Estimate the minutes remaining to reach any target percent - typically the
 * user's own charge-alert threshold, so "time to full" and "time to my
 * alert" can both be shown without maintaining two separate estimators.
 */
export function estimateTimeToTarget(
  samples: NativeBatteryTelemetry[] | null | undefined,
  currentLevelPercent: number,
  targetPercent: number,
  windowSize: number = 6,
): number | null {
  if (currentLevelPercent >= targetPercent) return 0;
  const projection = estimateChargeTimeToTarget(samples, currentLevelPercent, targetPercent, windowSize);
  return projection ? projection.minutes : null;
}

export function formatTimeToFull(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes <= 0) return "Full";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Estimated instantaneous power draw in watts, from current (µA) and voltage
 * (mV) telemetry that's already on hand - no new native fields needed.
 */
export function estimateWatts(currentMicroA: number | null, voltageMv: number | null): number | null {
  if (currentMicroA === null || voltageMv === null || voltageMv <= 0) return null;
  const amps = Math.abs(currentMicroA) / 1_000_000;
  const volts = voltageMv / 1000;
  return Number((amps * volts).toFixed(1));
}

/**
 * mAh drawn from the battery during a discharge session, using the delta
 * between BATTERY_PROPERTY_CHARGE_COUNTER at start and end. Positive number
 * means that much capacity was consumed.
 */
export function computeMAhDelta(startCounterMicroAh: number | null, endCounterMicroAh: number | null): number | null {
  if (startCounterMicroAh === null || endCounterMicroAh === null) return null;
  if (startCounterMicroAh <= 0 || endCounterMicroAh <= 0) return null;
  const deltaMicroAh = startCounterMicroAh - endCounterMicroAh;
  if (deltaMicroAh <= 0) return null;
  return Math.round(deltaMicroAh / 1000);
}

/**
 * Filters raw samples to those from roughly the last N hours - the input for
 * the Insights 24H curve.
 */
export function last24HoursOfSamples(samples: NativeBatteryTelemetry[] | null | undefined, hours: number = 24): NativeBatteryTelemetry[] {
  if (!samples || samples.length === 0) return [];
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return samples.filter((s) => s.timestamp >= cutoff);
}