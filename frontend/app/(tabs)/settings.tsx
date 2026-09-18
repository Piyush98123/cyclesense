import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, SectionTitle } from "@/src/components/cyclesense-ui";
//import { capabilityLabels, Capabilities } from "@/src/data/cyclesense";
import { capabilityLabels, Capabilities, dashboardCardLabels, DashboardCardId, moveDashboardCard } from "@/src/data/cyclesense";
import { useCycleSense } from "@/src/hooks/useCycleSense";
import { makeStyles, useTheme } from "@/src/theme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { settings, updateSettings, exportCsv, nativeBridgeActive, requestUsageStats, hasUsageStatsPermission, capabilities } = useCycleSense();
  const [exporting, setExporting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [usageStatsGranted, setUsageStatsGranted] = useState(false);

  const refreshUsageStatsPermission = useCallback(async () => {
    setUsageStatsGranted(await hasUsageStatsPermission());
  }, [hasUsageStatsPermission]);
  useEffect(() => { refreshUsageStatsPermission(); }, [refreshUsageStatsPermission]);

  const threshold = async (key: "chargeAlert" | "dischargeAlert", delta: number) => updateSettings({ [key]: Math.min(100, Math.max(5, settings[key] + delta)) });
  const handleExport = async () => { setExporting(true); const result = await exportCsv(); setExporting(false); Alert.alert(result.ok ? "CSV ready" : "Export unavailable", result.ok ? "Your session history is ready in the share sheet." : result.reason); };

  const handleUsageStatsToggle = async (value: boolean) => {
    if (!value) {
      await updateSettings({ usageStatsEnabled: false });
      return;
    }
    if (!nativeBridgeActive) {
      Alert.alert("Native build required", "Usage access reads app-level usage data. Available only on a signed Android build.");
      return;
    }
    const result = await requestUsageStats();
    if (result.granted) {
      await updateSettings({ usageStatsEnabled: true });
      setUsageStatsGranted(true);
    } else {
      Alert.alert("Grant Usage access", result.reason);
    }
  };

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
    <AppHeader title="Settings" subtitle="Make the signal work for you" />
    <SectionTitle title="Alerts & cues" />
    <View style={styles.group}><SettingRow icon="volume-high" title="Sound cues" body="Different cue for plug-in and unplug" value={<Switch testID="settings-sound-cues" value={settings.soundCues} onValueChange={(value) => updateSettings({ soundCues: value })} trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }} thumbColor={settings.soundCues ? colors.brandPrimary : colors.muted} />} /><View style={styles.divider} /><ThresholdRow icon="battery-charging-80" title="Charging alert" body="Notify while charging" value={settings.chargeAlert} onMinus={() => threshold("chargeAlert", -5)} onPlus={() => threshold("chargeAlert", 5)} /><View style={styles.divider} /><ThresholdRow icon="battery-low" title="Discharge alert" body="Alert while discharging" value={settings.dischargeAlert} onMinus={() => threshold("dischargeAlert", -5)} onPlus={() => threshold("dischargeAlert", 5)} /></View>
    <SectionTitle title="Dashboard" />
    <View style={styles.group}><SettingRow icon="monitor-dashboard" title="Always-on status" body="Keep a compact status visible when supported" value={<Switch testID="settings-always-on" value={settings.alwaysOn} onValueChange={(value) => updateSettings({ alwaysOn: value })} trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }} thumbColor={settings.alwaysOn ? colors.brandPrimary : colors.muted} />} /><View style={styles.divider} /><SettingRow icon="clock-time-eight-outline" title="Background sampling" body={nativeBridgeActive ? "WorkManager samples every 15 min" : "Requires a native Android build"} value={<Switch testID="settings-background-sampling" value={settings.backgroundSampling && nativeBridgeActive} disabled={!nativeBridgeActive} onValueChange={(value) => updateSettings({ backgroundSampling: value })} trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }} thumbColor={settings.backgroundSampling && nativeBridgeActive ? colors.brandPrimary : colors.muted} />} /></View>
        <SectionTitle title="Dashboard order" action="Reorder cards" />
    <View style={styles.group}>{settings.dashboardOrder.map((id, index, arr) => (
      <View key={id}>
        <View style={styles.settingRow}>
          <View style={styles.settingIcon}><MaterialCommunityIcons name="drag-horizontal-variant" size={21} color={colors.brandPrimary} /></View>
          <View style={styles.settingCopy}><Text style={styles.settingTitle}>{dashboardCardLabels[id]}</Text></View>
          <View style={styles.stepper}>
            <Pressable testID={`dashboard-order-up-${id}`} disabled={index === 0} onPress={() => updateSettings({ dashboardOrder: moveDashboardCard(settings.dashboardOrder, id, -1) })} accessibilityRole="button" style={[styles.stepButton, index === 0 && styles.stepButtonDisabled]}><MaterialCommunityIcons name="chevron-up" size={20} color={index === 0 ? colors.muted : colors.onSurface} /></Pressable>
            <Pressable testID={`dashboard-order-down-${id}`} disabled={index === arr.length - 1} onPress={() => updateSettings({ dashboardOrder: moveDashboardCard(settings.dashboardOrder, id, 1) })} accessibilityRole="button" style={[styles.stepButton, index === arr.length - 1 && styles.stepButtonDisabled]}><MaterialCommunityIcons name="chevron-down" size={20} color={index === arr.length - 1 ? colors.muted : colors.onSurface} /></Pressable>
          </View>
        </View>
        {index < arr.length - 1 ? <View style={styles.divider} /> : null}
      </View>
    ))}</View>
    <SectionTitle title="Device capabilities" action={nativeBridgeActive ? "Detected at startup" : "Preview mode"} />
    <View style={styles.group}>{Object.keys(capabilityLabels).map((key, index, arr) => (
      <View key={key}>
        <CapabilityRow name={capabilityLabels[key as keyof Capabilities]} available={capabilities[key as keyof Capabilities]} />
        {index < arr.length - 1 ? <View style={styles.divider} /> : null}
      </View>
    ))}</View>
    <SectionTitle title="Data & privacy" />
    <View style={styles.group}><SettingRow icon="cellphone-lock" title="On-device storage" body="No account, cloud sync, or backend required" value={<MaterialCommunityIcons name="check-circle" size={21} color={colors.success} />} /><View style={styles.divider} /><Pressable testID="settings-export" onPress={handleExport} disabled={exporting} accessibilityRole="button" style={({ pressed }) => [styles.exportRow, pressed && styles.pressed]}><View style={styles.settingIcon}><MaterialCommunityIcons name="file-delimited-outline" size={21} color={colors.brandPrimary} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>{exporting ? "Preparing CSV…" : "Export session history"}</Text><Text style={styles.settingBody}>Generate a portable CSV from local records</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} /></Pressable></View>
    <Pressable testID="settings-toggle-advanced" onPress={() => setShowAdvanced((prev) => !prev)} accessibilityRole="button" style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}><MaterialCommunityIcons name={showAdvanced ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} /><Text style={styles.advancedToggleText}>{showAdvanced ? "Hide advanced" : "Advanced (native only)"}</Text></Pressable>
    {showAdvanced ? <>
      <SectionTitle title="Advanced" action={nativeBridgeActive ? "Native bridge active" : "Preview mode"} />
      <View style={styles.group}>
        <SettingRow icon="chart-timeline-variant" title="App usage stats" body={usageStatsGranted ? "Permission granted" : "Off by default. Opt-in via system settings."} value={<Switch testID="settings-usage-stats" value={settings.usageStatsEnabled && usageStatsGranted} onValueChange={handleUsageStatsToggle} trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }} thumbColor={settings.usageStatsEnabled && usageStatsGranted ? colors.brandPrimary : colors.muted} />} />
        <View style={styles.divider} />
        <Pressable testID="settings-usage-stats-recheck" onPress={refreshUsageStatsPermission} accessibilityRole="button" style={({ pressed }) => [styles.exportRow, pressed && styles.pressed]}><View style={styles.settingIcon}><MaterialCommunityIcons name="refresh" size={21} color={colors.brandPrimary} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>Re-check permission</Text><Text style={styles.settingBody}>Refresh after granting Usage access</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} /></Pressable>
      </View>
    </> : null}
    <View style={styles.footer}><Text style={styles.footerTitle}>CycleSense</Text><Text style={styles.footerBody}>Battery intelligence without the noise.</Text><Text style={styles.version}>Android-first · Capability-aware</Text></View>
  </ScrollView></View>;
}

function SettingRow({ icon, title, body, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string; value: React.ReactNode }) { const styles = useStyles(); return <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialCommunityIcons name={icon} size={21} color={styles.icon.color} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingBody}>{body}</Text></View>{value}</View>; }
function ThresholdRow({ icon, title, body, value, onMinus, onPlus }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string; value: number; onMinus: () => void; onPlus: () => void }) { const styles = useStyles(); return <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialCommunityIcons name={icon} size={21} color={styles.icon.color} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingBody}>{body}</Text></View><View style={styles.stepper}><Pressable onPress={onMinus} accessibilityRole="button" style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable><Text style={styles.threshold}>{value}%</Text><Pressable onPress={onPlus} accessibilityRole="button" style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable></View></View>; }
function CapabilityRow({ name, available }: { name: string; available: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return <View style={styles.settingRow}>
    <View style={styles.settingIcon}><MaterialCommunityIcons name={available ? "check-circle-outline" : "minus-circle-outline"} size={21} color={available ? colors.success : colors.muted} /></View>
    <View style={styles.settingCopy}><Text style={styles.settingTitle}>{name}</Text><Text style={styles.settingBody}>{available ? "Available on this device" : "Not reported by this device"}</Text></View>
  </View>;
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 20, gap: 16 }, group: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 }, settingRow: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12 }, exportRow: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12 }, settingIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }, icon: { color: colors.brandPrimary }, settingCopy: { flex: 1, gap: 4 }, settingTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "500" }, settingBody: { color: colors.muted, fontSize: 12, lineHeight: 17 }, divider: { height: 1, backgroundColor: colors.divider }, stepper: { flexDirection: "row", alignItems: "center", gap: 8 }, stepButton: { minWidth: 40, minHeight: 40, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },stepButtonDisabled: { opacity: 0.4 }, stepText: { color: colors.onSurface, fontSize: 21, fontWeight: "400" }, threshold: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600", minWidth: 38, textAlign: "center" }, pressed: { opacity: 0.72 }, advancedToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 4 }, advancedToggleText: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" }, footer: { alignItems: "center", gap: 5, paddingVertical: 20 }, footerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "500" }, footerBody: { color: colors.onSurfaceSecondary, fontSize: 13 }, version: { color: colors.muted, fontSize: 11, marginTop: 4 },
}));