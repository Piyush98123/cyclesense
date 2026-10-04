import { formatDataUsage, mergeNetworkUsageIntoTopApps } from "@/src/data/network-usage";
import { TopApp } from "@/src/data/cyclesense";
import type { NativeNetworkUsageStat } from "@/modules/cyclesense-native/src";

function mkTopApp(overrides: Partial<TopApp> = {}): TopApp {
  return { packageName: "com.example.app", label: "Example App", minutes: 10, ...overrides };
}

function mkNetStat(overrides: Partial<NativeNetworkUsageStat> = {}): NativeNetworkUsageStat {
  return { packageName: "com.example.app", label: "Example App", totalBytes: 0, ...overrides };
}

describe("mergeNetworkUsageIntoTopApps", () => {
  it("adds dataUsageMb to a matching app by package name", () => {
    const topApps = [mkTopApp({ packageName: "com.a" })];
    const stats = [mkNetStat({ packageName: "com.a", totalBytes: 5 * 1024 * 1024 })];
    const merged = mergeNetworkUsageIntoTopApps(topApps, stats);
    expect(merged[0].dataUsageMb).toBe(5);
  });

  it("leaves dataUsageMb undefined for an app with foreground time but no network entry", () => {
    const topApps = [mkTopApp({ packageName: "com.offline-game" })];
    const merged = mergeNetworkUsageIntoTopApps(topApps, [mkNetStat({ packageName: "com.other" })]);
    expect(merged[0].dataUsageMb).toBeUndefined();
  });

  it("never coerces a missing match to zero - undefined means unmeasured, not zero usage", () => {
    const topApps = [mkTopApp({ packageName: "com.a" })];
    const merged = mergeNetworkUsageIntoTopApps(topApps, []);
    expect(merged[0].dataUsageMb).not.toBe(0);
    expect(merged[0].dataUsageMb).toBeUndefined();
  });

  it("returns the original array unchanged when there are no network stats at all", () => {
    const topApps = [mkTopApp()];
    expect(mergeNetworkUsageIntoTopApps(topApps, [])).toBe(topApps);
  });

  it("sums multiple network entries for the same package before merging", () => {
    const topApps = [mkTopApp({ packageName: "com.a" })];
    const stats = [
      mkNetStat({ packageName: "com.a", totalBytes: 2 * 1024 * 1024 }),
      mkNetStat({ packageName: "com.a", totalBytes: 3 * 1024 * 1024 }),
    ];
    const merged = mergeNetworkUsageIntoTopApps(topApps, stats);
    expect(merged[0].dataUsageMb).toBe(5);
  });

  it("ignores zero or negative byte entries", () => {
    const topApps = [mkTopApp({ packageName: "com.a" })];
    const merged = mergeNetworkUsageIntoTopApps(topApps, [mkNetStat({ packageName: "com.a", totalBytes: 0 })]);
    expect(merged[0].dataUsageMb).toBeUndefined();
  });

  it("does not mutate the original topApps array or its entries", () => {
    const original = mkTopApp({ packageName: "com.a" });
    const topApps = [original];
    mergeNetworkUsageIntoTopApps(topApps, [mkNetStat({ packageName: "com.a", totalBytes: 1024 * 1024 })]);
    expect(original.dataUsageMb).toBeUndefined();
  });
});

describe("formatDataUsage", () => {
  it("formats sub-MB usage in KB", () => {
    expect(formatDataUsage(0.5)).toBe("512 KB");
  });

  it("formats normal usage in MB with one decimal", () => {
    expect(formatDataUsage(42.3)).toBe("42.3 MB");
  });

  it("formats large usage in GB", () => {
    expect(formatDataUsage(1500)).toBe("1.5 GB");
  });

  it("returns null for null or undefined input", () => {
    expect(formatDataUsage(null)).toBeNull();
    expect(formatDataUsage(undefined)).toBeNull();
  });
});
