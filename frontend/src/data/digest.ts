import { Session } from "@/src/data/cyclesense";

export type Digest = {
  totalSessions: number;
  totalMAh: number | null;
  averageDrain: number | null;
  averageChargeMinutes: number | null;
  bestDay: string | null;
  worstDay: string | null;
};

export type DigestPeriod = "daily" | "5day";

export type DigestTrend = {
  /** "up" means the headline metric (average drain rate) got worse, i.e.
   *  faster drain than the prior period - not a generic "good/bad" arrow. */
  direction: "up" | "down" | "flat";
  deltaPercent: number | null;
};

export type DigestWithTrend = Digest & { trend: DigestTrend };

const PERIOD_DAYS: Record<DigestPeriod, number> = { daily: 1, "5day": 5 };
const TREND_FLAT_THRESHOLD_PERCENT = 5;

function computeDigestForWindow(sessions: Session[], startMs: number, endMs: number): Digest {
  const closed = sessions.filter((s) => s.endAt !== null && new Date(s.startAt).getTime() >= startMs && new Date(s.startAt).getTime() < endMs);
  const dischargeRates = closed.filter((s) => s.mode === "discharge" && s.rate !== null).map((s) => s.rate as number);
  const chargeDurations = closed.filter((s) => s.mode === "charge" && s.durationMinutes !== null).map((s) => s.durationMinutes as number);
  const mAhTotal = closed
    .filter((s) => s.mode === "discharge")
    .reduce((acc, s) => acc + (s.mAhDelta ?? 0), 0);
  const perDay = new Map<string, number>();
  for (const s of closed) {
    if (s.mode !== "discharge" || s.rate === null) continue;
    const day = new Date(s.startAt).toISOString().slice(0, 10);
    perDay.set(day, Math.max(perDay.get(day) ?? 0, s.rate));
  }
  const days = [...perDay.entries()].sort((a, b) => a[1] - b[1]);
  return {
    totalSessions: closed.length,
    totalMAh: mAhTotal > 0 ? mAhTotal : null,
    averageDrain: dischargeRates.length > 0 ? Number((dischargeRates.reduce((a, b) => a + b, 0) / dischargeRates.length).toFixed(1)) : null,
    averageChargeMinutes: chargeDurations.length > 0 ? Math.round(chargeDurations.reduce((a, b) => a + b, 0) / chargeDurations.length) : null,
    bestDay: days[0]?.[0] ?? null,
    worstDay: days[days.length - 1]?.[0] ?? null,
  };
}

function computeTrend(current: number | null, previous: number | null): DigestTrend {
  if (current === null || previous === null || previous === 0) return { direction: "flat", deltaPercent: null };
  const deltaPercent = Number((((current - previous) / previous) * 100).toFixed(1));
  if (Math.abs(deltaPercent) < TREND_FLAT_THRESHOLD_PERCENT) return { direction: "flat", deltaPercent };
  return { direction: deltaPercent > 0 ? "up" : "down", deltaPercent };
}

/**
 * Digest for a rolling period - daily or a 5-day rollup - plus a trend
 * against the immediately preceding period of the same length. Default
 * changed from the original hardcoded 7-day window to "daily" as the most
 * immediately useful default; existing callers that don't pass a period
 * now get the daily view rather than silently keeping the old weekly one,
 * so any UI relying on the previous default should pass "5day" explicitly
 * if that's what it actually wants.
 */
export function computeDigest(sessions: Session[], period: DigestPeriod = "daily"): DigestWithTrend {
  const days = PERIOD_DAYS[period];
  const now = Date.now();
  const currentStart = now - days * 24 * 60 * 60 * 1000;
  const previousStart = now - days * 2 * 24 * 60 * 60 * 1000;
  const current = computeDigestForWindow(sessions, currentStart, now);
  const previous = computeDigestForWindow(sessions, previousStart, currentStart);
  return { ...current, trend: computeTrend(current.averageDrain, previous.averageDrain) };
}

export type ChargingHabits = {
  avgStartPercent: number | null;
  avgEndPercent: number | null;
  sessionsPerDay: number | null;
  overnightCount: number;
  /** 0-23, the hour charge sessions most often begin. */
  typicalStartHour: number | null;
};

// Heuristic, not user-configured: a session starting in this window and
// lasting a real while is treated as "overnight" rather than an incidental
// late top-up.
const OVERNIGHT_START_HOUR = 21;
const OVERNIGHT_END_HOUR = 6;
const OVERNIGHT_MIN_DURATION_MINUTES = 180;

export function computeChargingHabits(sessions: Session[], windowDays: number = 30): ChargingHabits {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const charges = sessions.filter((s) => s.mode === "charge" && s.endAt !== null && new Date(s.startAt).getTime() >= cutoff);
  if (charges.length === 0) {
    return { avgStartPercent: null, avgEndPercent: null, sessionsPerDay: null, overnightCount: 0, typicalStartHour: null };
  }

  const avgStartPercent = Math.round(charges.reduce((acc, s) => acc + s.startLevel, 0) / charges.length);
  const endLevels = charges.filter((s) => s.endLevel !== null).map((s) => s.endLevel as number);
  const avgEndPercent = endLevels.length > 0 ? Math.round(endLevels.reduce((a, b) => a + b, 0) / endLevels.length) : null;

  const hourCounts = new Map<number, number>();
  let overnightCount = 0;
  for (const s of charges) {
    const hour = new Date(s.startAt).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    const isLateOrEarly = hour >= OVERNIGHT_START_HOUR || hour < OVERNIGHT_END_HOUR;
    if (isLateOrEarly && (s.durationMinutes ?? 0) >= OVERNIGHT_MIN_DURATION_MINUTES) overnightCount += 1;
  }
  const typicalStartHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const earliestStartMs = Math.min(...charges.map((s) => new Date(s.startAt).getTime()));
  const spanDays = Math.max(1, (Date.now() - earliestStartMs) / (24 * 60 * 60 * 1000));
  const sessionsPerDay = Number((charges.length / spanDays).toFixed(1));

  return { avgStartPercent, avgEndPercent, sessionsPerDay, overnightCount, typicalStartHour };
}

export function formatHabitHour(hour: number | null): string {
  if (hour === null) return "—";
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}${period}`;
}

/**
 * Plain-language charging habit summary. Follows the "information, not
 * accusation" product principle - describes the pattern observed, never
 * frames it as good/bad ("you frequently charge overnight" rather than
 * "you're damaging your battery").
 */
export function describeChargingHabits(habits: ChargingHabits): string | null {
  if (habits.avgStartPercent === null) return null;
  const windowText = habits.typicalStartHour !== null ? ` around ${formatHabitHour(habits.typicalStartHour)}` : "";
  const endText = habits.avgEndPercent !== null ? `${habits.avgEndPercent}%` : "an unrecorded level";
  const overnightText = habits.overnightCount > 0
    ? ` You've charged overnight ${habits.overnightCount} time${habits.overnightCount === 1 ? "" : "s"} in this window.`
    : "";
  return `You typically plug in${windowText}, starting at about ${habits.avgStartPercent}% and ending near ${endText}.${overnightText}`;
}

export const DIARY_TAG_PRESETS = ["Traveling", "Gaming", "Hot day", "Streaming", "GPS", "Workout"] as const;
