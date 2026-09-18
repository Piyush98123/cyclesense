import { Session } from "@/src/data/cyclesense";

export type Digest = {
  totalSessions: number;
  totalMAh: number | null;
  averageDrain: number | null;
  averageChargeMinutes: number | null;
  bestDay: string | null;
  worstDay: string | null;
};

/**
 * Rolling 7-day summary over the closed sessions we have on device. Cheap
 * to recompute on every `sessions` change - the archive is capped at 5.
 */
export function computeDigest(sessions: Session[]): Digest {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const closed = sessions.filter((s) => s.endAt !== null && new Date(s.startAt).getTime() >= cutoff);
  const dischargeRates = closed.filter((s) => s.mode === "discharge" && s.rate !== null).map((s) => s.rate as number);
  const chargeDurations = closed.filter((s) => s.mode === "charge" && s.durationMinutes !== null).map((s) => s.durationMinutes as number);
  const mAhTotal = closed.reduce((acc, s) => acc + (s.mAhDelta ?? 0), 0);
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

export const DIARY_TAG_PRESETS = ["Traveling", "Gaming", "Hot day", "Streaming", "GPS", "Workout"] as const;
