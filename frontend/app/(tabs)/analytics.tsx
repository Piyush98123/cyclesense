import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, ChartFrame, EmptyPanel, SectionTitle } from "@/src/components/cyclesense-ui";
import { isAnomaly, last24HoursOfSamples } from "@/src/data/analytics";
import { computeDigest } from "@/src/data/digest";
import { useCycleSense } from "@/src/hooks/useCycleSense";
import { makeStyles, useTheme } from "@/src/theme";

const ranges = ["24H", "30D", "Digest"] as const;

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { sessions, samples, screenDaily, screenDailyLive, capabilities, nativeBridgeActive, baseline } = useCycleSense();
  const [range, setRange] = useState<(typeof ranges)[number]>("24H");
  const hasCompleteCycle = sessions.some((session) => session.endAt !== null);

  const filteredSamples = useMemo(() => last24HoursOfSamples(samples, 24), [samples]);
  const curve = useMemo(() => {
    if (range !== "24H") return undefined;
    if (filteredSamples.length === 0) return undefined;
    return filteredSamples.map((s) => (s.levelPercent >= 0 ? s.levelPercent : s.level >= 0 ? s.level * 100 : 0));
  }, [range, filteredSamples]);

  const rateSum = sessions.reduce((acc, s) => (s.rate !== null && s.mode === "discharge" ? acc + s.rate : acc), 0);
  const rateCount = sessions.filter((s) => s.rate !== null && s.mode === "discharge").length;
  const averageDrain = rateCount > 0 ? `${(rateSum / rateCount).toFixed(1)}%` : "—";
  const screenTotal = screenDailyLive.totalOnMinutes > 0 ? formatMinutes(screenDailyLive.totalOnMinutes) : "—";
  const screenTotalHint = capabilities.screenTracking ? "On-screen today" : "Native build only";
  const longestStreak = screenDailyLive.longestOnMinutes > 0 ? formatMinutes(screenDailyLive.longestOnMinutes) : "—";
  const longestHint = capabilities.screenTracking ? "Longest run today" : "Native build only";
  const baselineDisplay = baseline !== null ? `${baseline.toFixed(1)}%` : "—";
  const baselineHint = baseline !== null ? "7-day discharge avg" : "Needs 2+ discharge cycles";

  const lastDischarge = sessions.find((s) => s.mode === "discharge" && s.endAt !== null);
  const showAnomaly = lastDischarge?.baselineDeviation != null && isAnomaly(lastDischarge.baselineDeviation);
  const digest = useMemo(() => computeDigest(sessions), [sessions]);

  const curveCaption = curve
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
    {!hasCompleteCycle && !curve ? <EmptyPanel icon="chart-timeline-variant" title="Accumulating power data" body="Complete your first charge or discharge session to unlock curves, health trends, and baseline comparisons." action="View timeline" onAction={() => router.push("/(tabs)/timeline")} /> : null}
    <SectionTitle title={range === "Digest" ? "Period digest" : range === "30D" ? "Health trend" : "Cycle curve"} action={curve ? `${filteredSamples.length} pts` : hasCompleteCycle ? "Session summary" : "Awaiting data"} />
    <ChartFrame label={range === "Digest" ? "Average drain rate" : range === "30D" ? "Battery health estimate" : "Charge / discharge"} caption={curveCaption} data={curve} />
    <View style={styles.insightGrid}>
      <Insight icon="speedometer" label="Average drain" value={averageDrain} detail="% / hour" />
      <Insight icon="monitor-cellphone" label="Screen-on time" value={screenTotal} detail={screenTotalHint} />
      <Insight icon="timer-sand" label="Longest streak" value={longestStreak} detail={longestHint} />
      <Insight icon="trending-up" label="Baseline" value={baselineDisplay} detail={baselineHint} />
    </View>
    <SectionTitle title="7-day digest" action={digest.totalSessions > 0 ? `${digest.totalSessions} sessions` : "Awaiting data"} />
    <View testID="insights-digest" style={styles.digestGrid}>
      <Insight icon="battery-charging-100" label="Avg drain" value={digest.averageDrain !== null ? `${digest.averageDrain}%` : "—"} detail="% / hour" />
      <Insight icon="lightning-bolt-outline" label="Avg charge" value={digest.averageChargeMinutes !== null ? formatMinutes(digest.averageChargeMinutes) : "—"} detail="0 → full" />
      <Insight icon="atom-variant" label="Energy in" value={digest.totalMAh !== null ? `${digest.totalMAh.toFixed(0)} mAh` : "—"} detail="Sum drawn" />
      <Insight icon="calendar-clock" label="Toughest day" value={digest.worstDay ? digest.worstDay.slice(5) : "—"} detail="Highest drain" />
    </View>
  </ScrollView></View>;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function Insight({ icon, label, value, detail }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; detail: string }) { const styles = useStyles(); return <View style={styles.insight}><MaterialCommunityIcons name={icon} size={18} color={styles.icon.color} /><Text style={styles.insightLabel}>{label}</Text><Text style={styles.insightValue}>{value}</Text><Text style={styles.insightDetail}>{detail}</Text></View>; }

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 20, gap: 18 },
  rangeBar: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border }, rangeButton: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center" }, rangeSelected: { backgroundColor: colors.brandPrimary }, rangeText: { color: colors.muted, fontSize: 12, fontWeight: "600" }, rangeTextSelected: { color: colors.onBrandPrimary },
  confidenceBanner: { flexDirection: "row", gap: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 15 }, bannerCopy: { flex: 1, gap: 4 }, bannerTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "500" }, bannerBody: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  anomalyCard: { flexDirection: "row", gap: 10, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, padding: 15 },
  anomalyTitle: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
  insightGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, digestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, insight: { width: "47%", minHeight: 126, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 7 }, icon: { color: colors.brandPrimary }, insightLabel: { color: colors.muted, fontSize: 12 }, insightValue: { color: colors.onSurface, fontSize: 24, fontWeight: "500", marginTop: 5 }, insightDetail: { color: colors.onSurfaceTertiary, fontSize: 11 },
}));
