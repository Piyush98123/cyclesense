import { TopApp } from "@/src/data/cyclesense";
import type { NativeNetworkUsageStat } from "@/modules/cyclesense-native/src";

/**
 * Folds NetworkStatsManager data-usage figures into the existing
 * UsageStatsManager-based top-apps correlation, by package name. This is
 * deliberately a merge into the same entries rather than a separate list -
 * the point of the Phase 2 extension is "here's what was active AND how
 * much data it used," one correlated view, not two disconnected ones.
 *
 * Apps with foreground time but no matching network entry (e.g. a game with
 * no network use) simply keep dataUsageMb undefined - never coerced to 0,
 * which would wrongly claim "measured, zero data" instead of "not measured."
 */
export function mergeNetworkUsageIntoTopApps(topApps: TopApp[], networkStats: NativeNetworkUsageStat[]): TopApp[] {
  if (networkStats.length === 0) return topApps;
  const byPackage = new Map<string, number>();
  for (const stat of networkStats) {
    if (stat.totalBytes <= 0) continue;
    byPackage.set(stat.packageName, (byPackage.get(stat.packageName) ?? 0) + stat.totalBytes);
  }
  return topApps.map((app) => {
    const bytes = byPackage.get(app.packageName);
    if (bytes === undefined) return app;
    return { ...app, dataUsageMb: Number((bytes / (1024 * 1024)).toFixed(1)) };
  });
}

export function formatDataUsage(mb: number | null | undefined): string | null {
  if (mb === null || mb === undefined) return null;
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(1)} GB`;
}