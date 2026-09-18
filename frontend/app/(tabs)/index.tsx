import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChartFrame, AppHeader, MetricTile, SectionTitle } from "@/src/components/cyclesense-ui";
import { formatTimeToFull } from "@/src/data/analytics";
import { modeLabel } from "@/src/data/cyclesense";
import { useCycleSense } from "@/src/hooks/useCycleSense";
import { makeStyles, useTheme } from "@/src/theme";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  //const { status, ready, openSession, refresh, nativeBridgeActive, chargerGreeting, dismissChargerGreeting, timeToFullMinutes } = useCycleSense();
  const { status, ready, openSession, refresh, nativeBridgeActive, chargerGreeting, dismissChargerGreeting, timeToFullMinutes, settings } = useCycleSense();
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    if (!chargerGreeting) return;
    const timer = setTimeout(() => dismissChargerGreeting(), 7000);
    return () => clearTimeout(timer);
  }, [chargerGreeting, dismissChargerGreeting]);
  const percent = status.level === null ? "--" : `${Math.round(status.level * 100)}`;
  const bridgeLabel = nativeBridgeActive ? "NATIVE" : status.available ? "LIVE" : "CAPABILITY CHECK";
  const isCharging = status.mode === "charging";
  const autoStatus = openSession
    ? `${openSession.mode === "charge" ? "Charge" : "Discharge"} session running · started at ${openSession.startLevel}%`
    : "Plug in the charger to start a session automatically";

  const powerDraw = status.currentNowMicroA != null ? `${(status.currentNowMicroA / 1000).toFixed(0)} mA` : "—";
  const powerDrawHint = status.currentNowMicroA != null ? (status.currentNowMicroA >= 0 ? "Charging into battery" : "Drawing from battery") : "Requires native bridge";
  const temperature = status.temperatureCelsius != null ? `${status.temperatureCelsius.toFixed(1)}°C` : "—";
  const temperatureHint = status.temperatureCelsius != null ? "Cell temperature" : "Requires native bridge";
  const health = status.healthLabel && status.healthLabel !== "unknown" ? status.healthLabel.replace(/_/g, " ") : "—";
  const healthHint = status.healthLabel ? "Reported by system" : "After first cycle";
  const fourthLabel = isCharging ? "Time to full" : status.voltageMv && status.voltageMv > 0 ? "Voltage" : "Since unplugged";
  const fourthValue = isCharging
    ? formatTimeToFull(timeToFullMinutes)
    : status.voltageMv && status.voltageMv > 0
      ? `${(status.voltageMv / 1000).toFixed(2)} V`
      : (openSession ? "Open" : "—");
  const fourthHint = isCharging
    ? (timeToFullMinutes === null ? "Warming up" : "From raw samples")
    : status.voltageMv && status.voltageMv > 0
      ? "Terminal voltage"
      : "Session window";

  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} size="large" /><Text style={styles.loadingText}>Binding device telemetry</Text></View>;

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
    <AppHeader title="Today" subtitle="Auto-tracks every plug and unplug" action="Refresh" onAction={refresh} />
    {chargerGreeting ? (
      <Pressable testID="charger-greeting" onPress={dismissChargerGreeting} accessibilityRole="button" style={({ pressed }) => [styles.greeting, pressed && styles.pressed]}>
          <View style={styles.greetingIcon}><MaterialCommunityIcons name={chargerGreeting.kind === "known" ? "power-plug-outline" : "star-shooting-outline"} size={22} color={colors.brandPrimary} /></View>
        <View style={styles.greetingCopy}>
          <Text style={styles.greetingKicker}>{chargerGreeting.kind === "known" ? "WELCOME BACK" : "NEW CHARGER"}</Text>
          <Text style={styles.greetingTitle}>{chargerGreeting.kind === "known" ? `Your ${chargerGreeting.name} is back` : `Remembering "${chargerGreeting.name}"`}</Text>
          <Text style={styles.greetingBody}>{chargerGreeting.kind === "known" ? "Recognized this cable from its current signature." : "CycleSense will learn its signature during this session."}</Text>
        </View>
        <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
      </Pressable>
    ) : null}
    { /** <View style={styles.statusCard}>
      <View style={styles.statusTop}><View><Text style={styles.cardKicker}>LIVE STATUS</Text><Text style={styles.statusLabel}>{modeLabel(status.mode)}</Text></View><View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>{bridgeLabel}</Text></View></View>
      <View style={styles.percentRow}><Text style={styles.percent}>{percent}</Text><Text style={styles.percentSign}>%</Text><View style={styles.batteryGlyph}><MaterialCommunityIcons name={status.mode === "charging" ? "battery-charging" : "battery-medium"} size={66} color={colors.brandPrimary} /></View></View>
      <Text style={styles.statusNote}>{nativeBridgeActive ? "Native BatteryManager bridge is streaming telemetry." : status.available ? "Reading the device power state directly." : "Battery metrics will appear when the native battery bridge is available."}</Text>
      <View testID="dashboard-auto-pill" style={styles.autoPill}><MaterialCommunityIcons name={openSession ? "record-circle-outline" : "power-plug-outline"} size={16} color={openSession ? colors.success : colors.muted} /><Text style={styles.autoPillText}>{autoStatus}</Text></View>
    </View>
    <SectionTitle title="Quick telemetry" action={nativeBridgeActive ? "Native fields" : "Fallback"} />
    <View style={styles.metricGrid}>
      <MetricTile icon="flash-outline" label="Power draw" value={powerDraw} hint={powerDrawHint} tone="accent" />
      <MetricTile icon="thermometer-low" label="Temperature" value={temperature} hint={temperatureHint} />
      <MetricTile icon="heart-pulse" label="Battery health" value={health} hint={healthHint} tone="success" />
      <MetricTile icon="clock-outline" label={fourthLabel} value={fourthValue} hint={fourthHint} tone={isCharging ? "success" : "neutral"} />
    </View>
    <SectionTitle title="Live curve" action="Raw samples" />
    <ChartFrame label="Charge / discharge curve" caption="Awaiting first complete cycle" /> **/ }
    {settings.dashboardOrder.map((cardId) => {
      if (cardId === "status") return (
        <View key="status" style={styles.statusCard}>
          <View style={styles.statusTop}><View><Text style={styles.cardKicker}>LIVE STATUS</Text><Text style={styles.statusLabel}>{modeLabel(status.mode)}</Text></View><View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>{bridgeLabel}</Text></View></View>
          <View style={styles.percentRow}><Text style={styles.percent}>{percent}</Text><Text style={styles.percentSign}>%</Text><View style={styles.batteryGlyph}><MaterialCommunityIcons name={status.mode === "charging" ? "battery-charging" : "battery-medium"} size={66} color={colors.brandPrimary} /></View></View>
          <Text style={styles.statusNote}>{nativeBridgeActive ? "Native BatteryManager bridge is streaming telemetry." : status.available ? "Reading the device power state directly." : "Battery metrics will appear when the native battery bridge is available."}</Text>
          <View testID="dashboard-auto-pill" style={styles.autoPill}><MaterialCommunityIcons name={openSession ? "record-circle-outline" : "power-plug-outline"} size={16} color={openSession ? colors.success : colors.muted} /><Text style={styles.autoPillText}>{autoStatus}</Text></View>
        </View>
      );
      if (cardId === "telemetry") return (
        <View key="telemetry">
          <SectionTitle title="Quick telemetry" action={nativeBridgeActive ? "Native fields" : "Fallback"} />
          <View style={styles.metricGrid}>
            <MetricTile icon="flash-outline" label="Power draw" value={powerDraw} hint={powerDrawHint} tone="accent" />
            <MetricTile icon="thermometer-low" label="Temperature" value={temperature} hint={temperatureHint} />
            <MetricTile icon="heart-pulse" label="Battery health" value={health} hint={healthHint} tone="success" />
            <MetricTile icon="clock-outline" label={fourthLabel} value={fourthValue} hint={fourthHint} tone={isCharging ? "success" : "neutral"} />
          </View>
        </View>
      );
      return (
        <View key="curve">
          <SectionTitle title="Live curve" action="Raw samples" />
          <ChartFrame label="Charge / discharge curve" caption="Awaiting first complete cycle" />
        </View>
      );
    })}
    <View style={styles.notice}><MaterialCommunityIcons name="shield-check-outline" size={20} color={colors.success} /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Private by default</Text><Text style={styles.noticeBody}>Your battery history stays on this device. No account or cloud sync is required.</Text></View></View>
  </ScrollView></View>;
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 20, gap: 18 },
  loading: { flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: colors.muted, fontSize: 14 },
  statusCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 20, padding: 20, gap: 12 },
  statusTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardKicker: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 1.6, fontWeight: "600" },
  statusLabel: { color: colors.onSurface, fontSize: 21, fontWeight: "500", marginTop: 5 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 99, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  liveText: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: "600", letterSpacing: 0.8 },
  percentRow: { flexDirection: "row", alignItems: "center", minHeight: 100 },
  percent: { color: colors.onSurface, fontSize: 72, fontWeight: "500", letterSpacing: -3 },
  percentSign: { color: colors.brandPrimary, fontSize: 24, fontWeight: "500", marginTop: 30, marginLeft: 5 },
  batteryGlyph: { marginLeft: "auto", opacity: 0.9 },
  statusNote: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  sessionButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 },
  sessionButtonText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  autoPill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  autoPillText: { color: colors.onSurface, fontSize: 12, fontWeight: "500" },
  pressed: { opacity: 0.72 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  notice: { flexDirection: "row", gap: 12, backgroundColor: colors.brandTertiary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 2 },
  noticeCopy: { flex: 1, gap: 4 },
  noticeTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  noticeBody: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  greeting: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, padding: 14 },
  greetingIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  greetingCopy: { flex: 1, gap: 3 },
  greetingKicker: { color: colors.brandPrimary, fontSize: 10, fontWeight: "600", letterSpacing: 1.4 },
  greetingTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  greetingBody: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
}));