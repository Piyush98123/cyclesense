import type { NativeUsageStat } from "@/modules/cyclesense-native/src";

export type AppRanking = {
  packageName: string;
  label: string;
  totalMinutes: number;
};

/**
 * getUsageStats(7) returns one entry per app per rough daily bucket (Android's
 * INTERVAL_DAILY semantics), not one row per app - so the same app can appear
 * several times across a week. This sums those into a single ranked total per
 * app, which is what a "top apps this week" list actually wants.
 */
export function computeWeeklyAppRanking(stats: NativeUsageStat[], topN: number = 8): AppRanking[] {
  const totals = new Map<string, { label: string; ms: number }>();
  for (const stat of stats) {
    if (stat.totalTimeForegroundMs <= 0) continue;
    const existing = totals.get(stat.packageName);
    if (existing) {
      existing.ms += stat.totalTimeForegroundMs;
    } else {
      totals.set(stat.packageName, { label: stat.label || stat.packageName, ms: stat.totalTimeForegroundMs });
    }
  }
  return [...totals.entries()]
    .map(([packageName, { label, ms }]) => ({ packageName, label, totalMinutes: Math.round(ms / 60000) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, topN);
}

export type WeekdayWeekendPattern = {
  weekdayAvgMinutes: number | null;
  weekendAvgMinutes: number | null;
};

/**
 * How many of the last `days` calendar days are weekdays vs weekend days.
 * Computed independently of the usage-stats data itself (pure calendar
 * arithmetic), so the averaging denominator doesn't depend on the API's
 * fuzzy per-entry day-bucketing - only which entries get classified as
 * weekday/weekend depends on that, not how many days we divide by.
 */
export function countWeekdayWeekendDays(days: number): { weekdayDays: number; weekendDays: number } {
  let weekdayDays = 0;
  let weekendDays = 0;
  for (let i = 0; i < days; i++) {
    const dayOfWeek = new Date(Date.now() - i * 24 * 60 * 60 * 1000).getDay(); // 0=Sun..6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) weekendDays += 1;
    else weekdayDays += 1;
  }
  return { weekdayDays, weekendDays };
}

/**
 * Average daily screen time on weekdays vs weekends over the given window.
 * Each usage-stats entry is classified as weekday/weekend by its own
 * timestamp - Android's daily buckets aren't guaranteed to align exactly to
 * midnight on every OEM, so this is an honest approximation, same spirit as
 * every other estimated figure in this app.
 */
export function computeWeekdayWeekendPattern(stats: NativeUsageStat[], days: number = 7): WeekdayWeekendPattern {
  // No usage data at all (permission just granted, nothing gathered yet)
  // must report as "unknown", not as a real average of zero - a 0m figure
  // reads as "you don't use your phone", which is a claim, not an absence.
  const usable = stats.filter((s) => s.totalTimeForegroundMs > 0);
  if (usable.length === 0) return { weekdayAvgMinutes: null, weekendAvgMinutes: null };

  const { weekdayDays, weekendDays } = countWeekdayWeekendDays(days);
  let weekdayTotalMs = 0;
  let weekendTotalMs = 0;
  for (const stat of usable) {
    const anchor = stat.lastTimeStampMs || stat.firstTimeStampMs;
    const dayOfWeek = new Date(anchor).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) weekendTotalMs += stat.totalTimeForegroundMs;
    else weekdayTotalMs += stat.totalTimeForegroundMs;
  }
  return {
    weekdayAvgMinutes: weekdayDays > 0 ? Math.round(weekdayTotalMs / 60000 / weekdayDays) : null,
    weekendAvgMinutes: weekendDays > 0 ? Math.round(weekendTotalMs / 60000 / weekendDays) : null,
  };
}

function formatHoursMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Plain-language weekday/weekend summary, following the same
 * "information, not accusation" tone as describeChargingHabits.
 */
export function describeWeekdayWeekendPattern(pattern: WeekdayWeekendPattern): string | null {
  if (pattern.weekdayAvgMinutes === null && pattern.weekendAvgMinutes === null) return null;
  if (pattern.weekdayAvgMinutes === null) {
    return `You average ${formatHoursMinutes(pattern.weekendAvgMinutes as number)} of screen time on weekend days.`;
  }
  if (pattern.weekendAvgMinutes === null) {
    return `You average ${formatHoursMinutes(pattern.weekdayAvgMinutes)} of screen time on weekdays.`;
  }
  return `You average ${formatHoursMinutes(pattern.weekdayAvgMinutes)} of screen time on weekdays and ${formatHoursMinutes(pattern.weekendAvgMinutes)} on weekend days.`;
}
