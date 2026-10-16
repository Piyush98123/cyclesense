import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, ChartFrame, EmptyPanel, InfoButton, SectionTitle } from "@/src/components/cyclesense-ui";
import { isAnomaly, last24HoursOfSamples } from "@/src/data/analytics";
import { averageDischargeRate, computeChargingHabits, computeDigest, describeChargingHabits, DigestPeriod } from "@/src/data/digest";
import { computeHealthTrend } from "@/src/data/health";
import { computeWeekdayWeekendPattern, computeWeeklyAppRanking, describeWeekdayWeekendPattern } from "@/src/data/screen-time";
import { CycleSenseNative } from "@/modules/cyclesense-native/src";
import type { NativeUsageStat } from "@/modules/cyclesense-native/src";
import { useCycleSense } from "@/src/hooks/useCycleSense";
import { makeStyles, useTheme } from "@/src/theme";

const ranges = ["24H", "30D", "Digest"] as const;
const digestPeriods: { id: DigestPeriod; label: string }[] = [
  { id: "daily", label: "24H" },
  { id: "5day", label: "5-Day" },
];

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { sessions, samples, screenDailyLive, capabilities, nativeBridgeActive, baseline, status, batteryHealth, settings, hasUsageStatsPermission } = useCycleSense();
  const [range, setRange] = useState<(typeof ranges)[number]>("24H");
  const [digestPeriod, setDigestPeriod] = useState<DigestPeriod>("daily");
  const hasCompleteCycle = sessions.some((session) => session.endAt !== null);

  const filteredSamples = useMemo(() => last24HoursOfSamples(samples, 24), [samples]);
  const curve = useMemo(() => {
    if (range !== "24H") return undefined;
    if (filteredSamples.length === 0) return undefined;
    return filteredSamples.map((s) => (s.levelPercent >= 0 ? s.levelPercent : s.level >= 0 ? s.level * 100 : 0));
  }, [range, filteredSamples]);
  // Real capacity-vs-design-capacity trend (see src/data/health.ts) rather
  // than reusing the 24H `curve` variable, which is always undefined
  // outside 24H mode - that was why this chart previously rendered empty
  // for every 30D view regardless of how much session history existed.
  const healthTrend = useMemo(
    () => computeHealthTrend(sessions, status.designCapacityMah),
    [sessions, status.designCapacityMah],
  );
  const chartData = range === "30D" ? (healthTrend.length > 0 ? healthTrend : undefined) : curve;

  const overallAverageDrain = averageDischargeRate(sessions);
  const averageDrain = overallAverageDrain !== null ? `${overallAverageDrain}%` : "—";
  const screenTotal = screenDailyLive.totalOnMinutes > 0 ? formatMinutes(screenDailyLive.totalOnMinutes) : "—";
  const screenTotalHint = capabilities.screenTracking ? "On-screen today" : "Native build only";
  const longestStreak = screenDailyLive.longestOnMinutes > 0 ? formatMinutes(screenDailyLive.longestOnMinutes) : "—";
  const longestHint = capabilities.screenTracking ? "Longest run today" : "Native build only";
  const baselineDisplay = baseline !== null ? `${baseline.toFixed(1)}%` : "—";
  const baselineHint = baseline !== null ? "7-day discharge avg" : "Needs 2+ discharges in 7 days";

  const lastDischarge = sessions.find((s) => s.mode === "discharge" && s.endAt !== null);
  const showAnomaly = lastDischarge?.baselineDeviation != null && isAnomaly(lastDischarge.baselineDeviation);
  const digest = useMemo(() => computeDigest(sessions, digestPeriod), [sessions, digestPeriod]);
  const habits = useMemo(() => computeChargingHabits(sessions), [sessions]);
  const habitSummary = useMemo(() => describeChargingHabits(habits), [habits]);

  // Weekly per-app ranking + weekday/weekend pattern - fetched on-demand
  // (not continuously live like telemetry) whenever this screen is viewed
  // with usage-stats permission actually granted. Reuses the same native
  // path (UsageStatsManager) as the existing per-session top-apps
  // correlation, just queried over a 7-day window instead of one session.
  const [weeklyUsageStats, setWeeklyUsageStats] = useState<NativeUsageStat[]>([]);
  useEffect(() => {
    if (!nativeBridgeActive || !settings.usageStatsEnabled) return;
    let active = true;
    (async () => {
      const granted = await hasUsageStatsPermission();
      if (!active || !granted) return;
      try {
        const stats = await CycleSenseNative.getUsageStats(7);
        if (active) setWeeklyUsageStats(stats);
      } catch {
        // best-effort - leave the section showing its empty state
      }
    })();
    return () => { active = false; };
  }, [nativeBridgeActive, settings.usageStatsEnabled, hasUsageStatsPermission]);

  const weeklyAppRanking = useMemo(() => computeWeeklyAppRanking(weeklyUsageStats, 5), [weeklyUsageStats]);
  const weekdayWeekendSummary = useMemo(
    () => describeWeekdayWeekendPattern(computeWeekdayWeekendPattern(weeklyUsageStats, 7)),
    [weeklyUsageStats],
  );
  // "up" means drain got faster (worse) vs the prior period of the same
  // length - not a generic good/bad direction, so this is spelled out
  // explicitly rather than just colored green/red.
  const trendDetail = digest.trend.direction === "flat" || digest.trend.deltaPercent === null
    ? "% / hour"
    : `% / hour · ${digest.trend.direction === "up" ? "▲" : "▼"} ${Math.abs(digest.trend.deltaPercent)}% vs prior`;

  const curveCaption = range === "30D"
    ? (healthTrend.length > 0
        ? `Estimated from discharge history · Confidence: ${batteryHealth.confidence}`
        : status.designCapacityMah
          ? "Needs a few full discharge cycles"
          : "Design capacity unavailable on this device")
    : curve
      ? `From ${filteredSamples.length} raw samples · Confidence: ${filteredSamples.length >= 24 ? "High" : "Medium"}`
      : nativeBridgeActive
        ? "Waiting for background samples"
        : "Native build required for raw samples";

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
    <AppHeader title="Insights" subtitle="Raw samples, clear patterns" />
    <View style={styles.rangeBar}>{ranges.map((item) => <Pressable testID={`analytics-range-${item}`} key={item} onPress={() => setRange(item)} accessibilityRole="button" accessibilityState={{ selected: range === item }} style={[styles.rangeButton, range === item && styles.rangeSelected]}><Text style={[styles.rangeText, range === item && styles.rangeTextSelected]}>{item}</Text></Pressable>)}</View>
    {showAnomaly && lastDischarge?.baselineDeviation != null ? (
      <View testID="insights-anomaly" style={styles.anomalyCard}>
        <MaterialCommunityIcons name={lastDischarge.baselineDeviation > 0 ? "alert-outline" : "trending-down"} size={20} color={lastDischarge.baselineDeviation > 0 ? colors.warning : colors.success} />
        <View style={styles.bannerCopy}>
          <Text style={styles.anomalyTitle}>{lastDischarge.baselineDeviation > 0 ? "Faster drain than usual" : "Better than usual"}</Text>
          <Text style={styles.bannerBody}>Last discharge was {Math.abs(lastDischarge.baselineDeviation).toFixed(0)}% {lastDischarge.baselineDeviation > 0 ? "above" : "below"} your 7-day baseline.</Text>
        </View>
      </View>
    ) : (
      <View style={styles.confidenceBanner}><MaterialCommunityIcons name="information-outline" size={19} color={colors.info} /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Confidence-aware analytics</Text><Text style={styles.bannerBody}>CycleSense separates raw measurements from estimates and always shows the confidence level.</Text></View></View>
    )}
    {!hasCompleteCycle && !curve && healthTrend.length === 0 ? <EmptyPanel icon="chart-timeline-variant" title="Accumulating power data" body="Complete your first charge or discharge session to unlock curves, health trends, and baseline comparisons." action="View timeline" onAction={() => router.push("/(tabs)/timeline")} /> : null}
    <SectionTitle
      title={range === "Digest" ? "Period digest" : range === "30D" ? "Health trend" : "Cycle curve"}
      action={range === "Digest"
        ? `${digest.totalSessions} sessions`
        : range === "30D"
          ? (healthTrend.length > 0 ? `${healthTrend.length} pts` : "Awaiting data")
          : curve
            ? `${filteredSamples.length} pts`
            : "Awaiting samples"}
      info={{
        title: range === "Digest" ? "About the digest" : range === "30D" ? "About the health trend" : "About the cycle curve",
        message: range === "Digest"
          ? "The digest summarizes completed sessions in the selected 24-hour or 5-day window. Average charge time needs at least one completed charge session; average drain and charge-drawn values need completed discharge data."
          : range === "30D"
            ? "The health trend needs at least two qualifying completed discharge sessions from the last 30 days, measured charge-counter changes, and a reported design capacity. Otherwise there is not enough data for a meaningful trend."
            : nativeBridgeActive
              ? "The 24-hour curve needs at least two recent native battery samples. Samples may take time to collect; optional background sampling adds readings while CycleSense is not open."
              : "The 24-hour curve requires a native Android build that can collect battery samples.",
        testID: "insights-chart-info",
      }}
    />
    {range !== "Digest" ? <ChartFrame label={range === "30D" ? "Battery health estimate" : "Charge / discharge"} caption={curveCaption} data={chartData} /> : null}
    <View style={styles.insightGrid}>
      <Insight icon="speedometer" label="Average drain" value={averageDrain} detail="% / hour" info={{
        title: "About average drain",
        message: "This average uses completed discharge sessions with a measurable drain rate. Record and finish a discharge session for it to appear.",
        testID: "insights-drain-info",
      }} />
      <Insight icon="monitor-cellphone" label="Screen-on time" value={screenTotal} detail={screenTotalHint} info={{
        title: "About screen-on time",
        message: "Today's total requires a native Android build with screen tracking available. Keep CycleSense installed and allow its required device access; totals accumulate during normal use.",
        testID: "insights-screen-time-info",
      }} />
      <Insight icon="timer-sand" label="Longest streak" value={longestStreak} detail={longestHint} info={{
        title: "About longest screen-on streak",
        message: "This is the longest continuous screen-on run today. It requires native screen-tracking support and updates as usage data becomes available.",
        testID: "insights-screen-streak-info",
      }} />
      <Insight icon="trending-up" label="Baseline" value={baselineDisplay} detail={baselineHint} info={{
        title: "About the baseline",
        message: "The baseline is the average rate from at least two completed discharge sessions in the last seven days. Charge sessions, open sessions, and older sessions do not count.",
        testID: "insights-baseline-info",
      }} />
      <Insight icon="heart-pulse" label="Battery health" value={batteryHealth.healthPercent !== null ? `${batteryHealth.healthPercent}%` : "—"} detail={batteryHealth.healthPercent !== null ? `From ${batteryHealth.sampleCount} discharge session${batteryHealth.sampleCount === 1 ? "" : "s"} · ${batteryHealth.confidence} confidence` : status.designCapacityMah ? "Needs more history" : "Unavailable on device"} info={{
        title: "About battery health",
        message: "This is a local estimate, not an official Android health reading. It needs completed discharge sessions with a sufficiently large level drop and measured charge-counter change, plus the device's design capacity. More qualifying sessions improve confidence; charging alone does not update the estimate.",
        testID: "insights-health-info",
      }} />
    </View>
    <SectionTitle title={digestPeriod === "daily" ? "24-hour digest" : "5-day digest"} action={digest.totalSessions > 0 ? `${digest.totalSessions} sessions` : "Awaiting data"} info={{
      title: "About the period digest",
      message: "The digest summarizes recorded sessions in the selected period. Charge-time averages need a completed charge session; drain metrics need completed discharge sessions with usable measurements. A session still in progress is not included.",
      testID: "insights-digest-info",
    }} />
    <View style={styles.periodBar}>{digestPeriods.map((item) => <Pressable testID={`digest-period-${item.id}`} key={item.id} onPress={() => setDigestPeriod(item.id)} accessibilityRole="button" accessibilityState={{ selected: digestPeriod === item.id }} style={[styles.periodButton, digestPeriod === item.id && styles.periodSelected]}><Text style={[styles.periodText, digestPeriod === item.id && styles.periodTextSelected]}>{item.label}</Text></Pressable>)}</View>
    <View testID="insights-digest" style={styles.digestGrid}>
      <Insight icon="battery-charging-100" label="Avg drain" value={digest.averageDrain !== null ? `${digest.averageDrain}%` : "—"} detail={trendDetail} info={{
        title: "About digest average drain",
        message: "This average needs completed discharge sessions with a usable drain measurement in the selected period.",
        testID: "insights-digest-drain-info",
      }} />
      <Insight icon="lightning-bolt-outline" label="Avg charge time" value={digest.averageChargeMinutes !== null ? formatMinutes(digest.averageChargeMinutes) : "—"} detail="Completed sessions · any level" info={{
        title: "About average charge time",
        message: "This average needs at least one completed charge session in the selected period. It averages the session durations as recorded, including partial charges; it is not necessarily a 0-to-100% charging time.",
        testID: "insights-charge-time-info",
      }} />
      <Insight icon="atom-variant" label="Charge drawn" value={digest.totalMAh !== null ? `${digest.totalMAh.toFixed(0)} mAh` : "—"} detail="Across discharge sessions" info={{
        title: "About charge drawn",
        message: "Charge drawn is calculated from the battery charge-counter change during completed discharge sessions. It is unavailable if the device does not report usable charge-counter readings.",
        testID: "insights-charge-drawn-info",
      }} />
      <Insight icon="calendar-clock" label="Toughest day" value={digest.worstDay ? digest.worstDay.slice(5) : "—"} detail="Highest drain" info={{
        title: "About toughest day",
        message: "This identifies the day with the highest measured drain in the selected period. It needs completed discharge-session data.",
        testID: "insights-toughest-day-info",
      }} />
    </View>
    {habitSummary ? (
      <View style={styles.confidenceBanner}><MaterialCommunityIcons name="clock-time-four-outline" size={19} color={colors.info} /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Charging habits</Text><Text style={styles.bannerBody}>{habitSummary}</Text></View></View>
    ) : null}

    <SectionTitle title="Weekly screen time" action={weeklyAppRanking.length > 0 ? "Last 7 days" : "Awaiting data"} info={{
      title: "About weekly screen time",
      message: "App rankings require a native Android build, Usage Stats enabled in Settings, and Android Usage Access permission. New or restricted devices may need time to accumulate usage data.",
      testID: "insights-usage-info",
    }} />
    {!settings.usageStatsEnabled ? (
      <EmptyPanel icon="apps" title="Usage access not enabled" body="Turn on App usage stats in Settings to see which apps used your screen time this week." action="Open settings" onAction={() => router.push("/(tabs)/settings")} />
    ) : weeklyAppRanking.length === 0 ? (
      <EmptyPanel icon="apps" title="Building this week's picture" body="Come back after a day or two of normal use to see your top apps and weekday/weekend pattern." />
    ) : <>
      <View style={styles.topApps}>{weeklyAppRanking.map((app, index) => (
        <View key={app.packageName} style={styles.topAppRow}>
          <View style={styles.topAppRank}><Text style={styles.topAppRankText}>{index + 1}</Text></View>
          <View style={styles.topAppCopy}><Text style={styles.topAppName}>{app.label}</Text><Text style={styles.topAppMeta}>This week</Text></View>
          <Text style={styles.topAppValue}>{formatMinutes(app.totalMinutes)}</Text>
        </View>
      ))}</View>
      {weekdayWeekendSummary ? (
        <View style={styles.confidenceBanner}><MaterialCommunityIcons name="calendar-week" size={19} color={colors.info} /><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Weekday vs weekend</Text><Text style={styles.bannerBody}>{weekdayWeekendSummary}</Text></View></View>
      ) : null}
    </>}
  </ScrollView></View>;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function Insight({ icon, label, value, detail, info }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; detail: string; info?: { title: string; message: string; testID: string } }) {
  const styles = useStyles();
  return (
    <View style={styles.insight}>
      <View style={styles.insightTop}>
        <MaterialCommunityIcons name={icon} size={18} color={styles.icon.color} />
        {info ? <InfoButton {...info} /> : null}
      </View>
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={styles.insightValue}>{value}</Text>
      <Text style={styles.insightDetail}>{detail}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 20, gap: 18 },
  rangeBar: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border }, rangeButton: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center" }, rangeSelected: { backgroundColor: colors.brandPrimary }, rangeText: { color: colors.muted, fontSize: 12, fontWeight: "600" }, rangeTextSelected: { color: colors.onBrandPrimary },
  periodBar: { flexDirection: "row", gap: 8, marginTop: -6 }, periodButton: { minHeight: 34, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, periodSelected: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary }, periodText: { color: colors.muted, fontSize: 12, fontWeight: "600" }, periodTextSelected: { color: colors.brandPrimary },
  confidenceBanner: { flexDirection: "row", gap: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 15 }, bannerCopy: { flex: 1, gap: 4 }, bannerTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "500" }, bannerBody: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  topApps: { gap: 8 }, topAppRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceTertiary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }, topAppRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }, topAppRankText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" }, topAppCopy: { flex: 1, gap: 2 }, topAppName: { color: colors.onSurface, fontSize: 14, fontWeight: "500" }, topAppMeta: { color: colors.muted, fontSize: 10 }, topAppValue: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600" },
  anomalyCard: { flexDirection: "row", gap: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, padding: 15 },
  anomalyTitle: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
  insightGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, digestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, insight: { width: "47%", minHeight: 126, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 7 }, insightTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 24 }, icon: { color: colors.brandPrimary }, insightLabel: { color: colors.muted, fontSize: 12 }, insightValue: { color: colors.onSurface, fontSize: 24, fontWeight: "500", marginTop: 5 }, insightDetail: { color: colors.onSurfaceTertiary, fontSize: 11 },
}));
