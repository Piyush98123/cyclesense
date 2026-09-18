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
 * Estimate the minutes remaining to reach 100% charge based on the recent
 * raw-sample trend. Uses the last window (default: 6 samples ≈ 90 minutes
 * at 15-min cadence) to smooth out short bursts.
 */
export function estimateTimeToFull(
  samples: NativeBatteryTelemetry[] | null | undefined,
  currentLevelPercent: number,
  windowSize: number = 6,
): number | null {
  if (!samples || samples.length < 2) return null;
  if (currentLevelPercent >= 100) return 0;
  const recent = samples.slice(-windowSize).filter((s) => s.levelPercent >= 0);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const deltaLevel = last.levelPercent - first.levelPercent;
  const deltaMs = last.timestamp - first.timestamp;
  if (deltaLevel <= 0 || deltaMs <= 0) return null;
  const perMinute = deltaLevel / (deltaMs / 60000);
  const remaining = 100 - currentLevelPercent;
  return Math.round(remaining / perMinute);
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
