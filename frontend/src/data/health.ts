import { Session } from "@/src/data/cyclesense";

export type CapacityEstimate = {
  estimatedMah: number | null;
  sampleCount: number;
};

export type BatteryHealth = {
  healthPercent: number | null;
  confidence: "High" | "Medium" | "Low";
  sampleCount: number;
};

// A short discharge session's mAh/percent ratio is noisy (measurement error
// dominates), so sessions below this drop are excluded from the estimate
// entirely rather than diluting it.
const MIN_PERCENT_DROP_FOR_ESTIMATE = 15;
const MAX_SAMPLES_FOR_ROLLING_ESTIMATE = 10;

/**
 * Estimates the phone's current full-charge capacity by normalizing each
 * discharge session's measured mAh draw (already computed via
 * computeMAhDelta at session close) to what it would be over a full 0-100%
 * cycle, then averaging the most recent estimates. This is the same
 * technique long used by battery-health apps that don't have privileged OS
 * access to an official "health %" - there isn't one on Android.
 */
export function estimateCurrentCapacity(sessions: Session[]): CapacityEstimate {
  const usable = sessions
    .filter((s) => s.mode === "discharge" && s.endAt !== null && s.mAhDelta !== null && s.endLevel !== null)
    .map((s) => ({
      percentDrop: s.startLevel - (s.endLevel as number),
      mAhDelta: s.mAhDelta as number,
      startAt: s.startAt,
    }))
    .filter((s) => s.percentDrop >= MIN_PERCENT_DROP_FOR_ESTIMATE)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .slice(0, MAX_SAMPLES_FOR_ROLLING_ESTIMATE);

  if (usable.length === 0) return { estimatedMah: null, sampleCount: 0 };

  const normalized = usable.map((s) => (s.mAhDelta / s.percentDrop) * 100);
  const avg = normalized.reduce((a, b) => a + b, 0) / normalized.length;
  return { estimatedMah: Math.round(avg), sampleCount: usable.length };
}

/**
 * healthPercent = estimated current full-charge capacity / design capacity.
 * confidence reflects how many discharge sessions the estimate is built
 * from - shown alongside the number so a 2-sample estimate isn't mistaken
 * for a stable reading (matches the app's "estimated vs. reported, always
 * labeled" principle).
 */
export function computeBatteryHealth(sessions: Session[], designCapacityMah: number | null | undefined): BatteryHealth {
  if (!designCapacityMah || designCapacityMah <= 0) {
    return { healthPercent: null, confidence: "Low", sampleCount: 0 };
  }
  const { estimatedMah, sampleCount } = estimateCurrentCapacity(sessions);
  if (estimatedMah === null) return { healthPercent: null, confidence: "Low", sampleCount: 0 };

  const healthPercent = Math.min(100, Math.round((estimatedMah / designCapacityMah) * 100));
  const confidence: BatteryHealth["confidence"] = sampleCount >= 5 ? "High" : sampleCount >= 2 ? "Medium" : "Low";
  return { healthPercent, confidence, sampleCount };
}

/**
 * Health % across chronological buckets of discharge sessions (oldest to
 * newest) - this is what feeds the Analytics "30D" chart, which previously
 * always rendered the empty placeholder regardless of how much data existed.
 * Each bucket is its own mini-estimate, so the result is a real (if
 * noisy, small-sample) trend rather than one static number repeated.
 */
export function computeHealthTrend(
  sessions: Session[],
  designCapacityMah: number | null | undefined,
  points: number = 8,
): number[] {
  if (!designCapacityMah || designCapacityMah <= 0) return [];

  const usable = sessions
    .filter((s) => s.mode === "discharge" && s.endAt !== null && s.mAhDelta !== null && s.endLevel !== null)
    .map((s) => ({
      percentDrop: s.startLevel - (s.endLevel as number),
      mAhDelta: s.mAhDelta as number,
      startAt: s.startAt,
    }))
    .filter((s) => s.percentDrop >= MIN_PERCENT_DROP_FOR_ESTIMATE)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  if (usable.length < 2) return [];

  const bucketSize = Math.max(1, Math.ceil(usable.length / points));
  const trend: number[] = [];
  for (let i = 0; i < usable.length; i += bucketSize) {
    const bucket = usable.slice(i, i + bucketSize);
    const normalized = bucket.map((s) => (s.mAhDelta / s.percentDrop) * 100);
    const avgMah = normalized.reduce((a, b) => a + b, 0) / normalized.length;
    trend.push(Math.min(100, Math.round((avgMah / designCapacityMah) * 100)));
  }
  return trend;
}