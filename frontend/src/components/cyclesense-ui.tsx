import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { makeStyles } from "@/src/theme";

export function AppHeader({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><MaterialCommunityIcons name="battery-sync-outline" size={22} color={styles.brandIcon.color} /></View>
        <View><Text style={styles.eyebrow}>CYCLESENSE</Text><Text style={styles.title}>{title}</Text></View>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {action && onAction ? <Pressable testID="header-action" onPress={onAction} accessibilityRole="button" style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><Text style={styles.headerActionText}>{action}</Text></Pressable> : null}
      </View>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  const styles = useStyles();
  return <View style={styles.sectionTitle}><Text style={styles.sectionText}>{title}</Text>{action ? <Text style={styles.sectionAction}>{action}</Text> : null}</View>;
}

export function MetricTile({ icon, label, value, hint, tone = "neutral" }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; hint: string; tone?: "neutral" | "accent" | "success" }) {
  const styles = useStyles();
  const toneStyle = tone === "accent" ? styles.metricAccent : tone === "success" ? styles.metricSuccess : styles.metricNeutral;
  return <View style={styles.metricTile}><MaterialCommunityIcons name={icon} size={18} color={toneStyle.color} /><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricHint}>{hint}</Text></View>;
}

export function EmptyPanel({ icon, title, body, action, onAction }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string; action?: string; onAction?: () => void }) {
  const styles = useStyles();
  return <View style={styles.emptyPanel}><View style={styles.emptyIcon}><MaterialCommunityIcons name={icon} size={28} color={styles.emptyIconColor.color} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text>{action && onAction ? <Pressable testID="empty-panel-action" onPress={onAction} accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{action}</Text></Pressable> : null}</View>;
}

export function ChartFrame({ label, caption, data }: { label: string; caption: string; data?: number[] }) {
  const styles = useStyles();
  const source = data?.slice(-32) ?? [];
  let bars: number[] = [];
  if (source.length > 0) {
    const min = Math.min(...source);
    const max = Math.max(...source);
    const range = Math.max(1, max - min);
    bars = source.map((value) => Math.round(((value - min) / range) * 88) + 8);
  }
  return <View style={styles.chartFrame}><View style={styles.chartHeader}><Text style={styles.chartLabel}>{label}</Text><Text style={styles.chartCaption}>{caption}</Text></View><View style={styles.chartArea}>{[0, 1, 2, 3].map((row) => <View key={row} style={styles.chartGrid} />)}<View style={styles.chartBars}>{bars.map((height, index) => <View key={index} style={[styles.chartBar, { height }]} />)}</View></View></View>;
}

export function CompareChartFrame({ labelA, labelB, seriesA, seriesB }: { labelA: string; labelB: string; seriesA: number[]; seriesB: number[] }) {
  const styles = useStyles();
  const all = [...seriesA, ...seriesB];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(1, max - min);
  const barsA = seriesA.map((v) => Math.round(((v - min) / range) * 88) + 8);
  const barsB = seriesB.map((v) => Math.round(((v - min) / range) * 88) + 8);
  return <View style={styles.chartFrame}>
    <View style={styles.chartHeader}>
      <Text style={styles.chartLabel}>Session comparison</Text>
      <View style={styles.compareLegend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendDotA]} /><Text style={styles.legendText}>{labelA}</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendDotB]} /><Text style={styles.legendText}>{labelB}</Text></View>
      </View>
    </View>
    <View style={styles.chartArea}>
      {[0, 1, 2, 3].map((row) => <View key={row} style={styles.chartGrid} />)}
      <View style={styles.compareBars}>{barsA.map((heightA, index) => (
        <View key={index} style={styles.compareSlot}>
          <View style={[styles.chartBar, styles.compareBarA, { height: heightA }]} />
          <View style={[styles.chartBar, styles.compareBarB, { height: barsB[index] ?? 8 }]} />
        </View>
      ))}</View>
    </View>
  </View>;
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  header: { paddingTop: 8, paddingBottom: 28, gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  brandIcon: { color: colors.brandPrimary },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "600", letterSpacing: 2 },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: "500", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13 },
  headerRight: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  headerActionText: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600" },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionText: { color: colors.onSurface, fontSize: 18, fontWeight: "500" },
  sectionAction: { color: colors.muted, fontSize: 12 },
  metricTile: { flex: 1, minWidth: "45%", backgroundColor: colors.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  metricLabel: { color: colors.muted, fontSize: 12 },
  metricValue: { color: colors.onSurface, fontSize: 20, fontWeight: "500", marginTop: 4 },
  metricHint: { color: colors.onSurfaceTertiary, fontSize: 11 },
  metricNeutral: { color: colors.onSurfaceSecondary },
  metricAccent: { color: colors.brandPrimary },
  metricSuccess: { color: colors.success },
  emptyPanel: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center", gap: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  emptyIconColor: { color: colors.brandPrimary },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "500", textAlign: "center" },
  emptyBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 300 },
  primaryButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.brandPrimary, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryButtonText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.72 },
  chartFrame: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  chartHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 },
  chartLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  chartCaption: { color: colors.muted, fontSize: 11 },
  chartArea: { height: 96, position: "relative", justifyContent: "space-between" },
  chartGrid: { height: 1, backgroundColor: colors.divider, width: "100%" },
  chartBars: { position: "absolute", inset: 0, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 4 },
  chartBar: { width: 8, borderRadius: 4, backgroundColor: colors.brandPrimary, opacity: 0.72 },
    compareLegend: { flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDotA: { backgroundColor: colors.brandPrimary },
  legendDotB: { backgroundColor: colors.warning },
  legendText: { color: colors.muted, fontSize: 11 },
  compareBars: { position: "absolute", inset: 0, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 4 },
  compareSlot: { flexDirection: "row", gap: 2, alignItems: "flex-end" },
  compareBarA: { width: 5, backgroundColor: colors.brandPrimary },
  compareBarB: { width: 5, backgroundColor: colors.warning },
}));