import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader, CompareChartFrame, EmptyPanel, SectionTitle } from "@/src/components/cyclesense-ui";
import { describeDrainDeviation } from "@/src/data/analytics";
import { formatDataUsage } from "@/src/data/network-usage";
import { Charger, ChargerCategory, formatClock, formatDuration, normalizeCurve, Session, SESSION_HISTORY_LIMIT } from "@/src/data/cyclesense";
import { DIARY_TAG_PRESETS } from "@/src/data/digest";
import { useCycleSense } from "@/src/hooks/useCycleSense";
import { makeStyles, useTheme } from "@/src/theme";

export default function Timeline() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const { sessions, chargers, ready, refresh, reloadSessions, renameCharger, forgetCharger, updateSessionDiary, baseline } = useCycleSense();
  const [selected, setSelected] = useState<Session | null>(null);
  const [editingCharger, setEditingCharger] = useState<Charger | null>(null);
  const [draftName, setDraftName] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const toggleCompareMode = () => { setCompareMode((v) => !v); setCompareIds([]); };
  const toggleCompareSelection = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((c) => c !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  };
  const compareSessions = sessions.filter((s) => compareIds.includes(s.id));
  useFocusEffect(useCallback(() => { refresh(); reloadSessions(); }, [refresh, reloadSessions]));

  const openRename = (charger: Charger) => { setEditingCharger(charger); setDraftName(charger.name); };
  const closeRename = () => { setEditingCharger(null); setDraftName(""); };
  const commitRename = async () => {
    if (editingCharger) await renameCharger(editingCharger.id, draftName);
    closeRename();
  };
  const handleForget = async () => {
    if (!editingCharger) return;
    await forgetCharger(editingCharger.id);
    closeRename();
  };

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
    <AppHeader title="Timeline" subtitle="Every cycle, one continuous view" />
    <View style={styles.summary}>
      <View><Text style={styles.summaryKicker}>RECORDED SESSIONS</Text><Text style={styles.summaryValue}>{sessions.length}</Text></View>
      <View style={styles.summaryDivider} />
      <View><Text style={styles.summaryKicker}>KNOWN CHARGERS</Text><Text style={styles.summaryValue}>{chargers.length}</Text></View>
    </View>
    {chargers.length > 0 ? <>
      <SectionTitle title="Known chargers" action="Tap to rename" />
      <View style={styles.chargerList}>{chargers.map((charger) => (
        <Pressable testID="charger-row" key={charger.id} onPress={() => openRename(charger)} accessibilityRole="button" style={({ pressed }) => [styles.chargerCard, pressed && styles.pressed]}>
          <View style={[styles.chargerIcon, chargerBadgeStyle(charger.category, styles)]}>
            <MaterialCommunityIcons name={chargerIconName(charger.plugLabel)} size={22} color={colors.brandPrimary} />
          </View>
          <View style={styles.chargerCopy}>
            <Text style={styles.chargerName}>{charger.name}</Text>
            <Text style={styles.chargerMeta}>{formatChargerMeta(charger)}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      ))}</View>
    </> : null}
    <View style={styles.sectionRow}>
      <SectionTitle title="Session history" action={ready ? `Last ${SESSION_HISTORY_LIMIT}` : "Loading"} />
      {sessions.length >= 2 ? <Pressable testID="compare-toggle" onPress={toggleCompareMode} accessibilityRole="button" style={({ pressed }) => [styles.compareToggle, compareMode && styles.compareToggleOn, pressed && styles.pressed]}>
        <Text style={[styles.compareToggleText, compareMode && styles.compareToggleTextOn]}>{compareMode ? "Cancel compare" : "Compare"}</Text>
      </Pressable> : null}
    </View>
    {sessions.length === 0 ? <EmptyPanel icon="timeline-clock-outline" title="No cycles recorded yet" body={`Plug in your device and CycleSense will automatically capture the charge session. Only the last ${SESSION_HISTORY_LIMIT} sessions are kept on device.`} /> : <View style={styles.list}>{sessions.map((session) => (
      <Pressable testID="session-row" key={session.id} onPress={() => compareMode ? toggleCompareSelection(session.id) : setSelected(session)} accessibilityRole="button" style={({ pressed }) => [styles.sessionRow, compareMode && compareIds.includes(session.id) && styles.sessionRowSelected, pressed && styles.pressed]}>
        <View style={[styles.sessionIcon, session.mode === "charge" ? styles.chargeIcon : styles.dischargeIcon]}>
          <MaterialCommunityIcons name={session.mode === "charge" ? "battery-charging" : "battery-minus-outline"} size={22} color={session.mode === "charge" ? colors.success : colors.warning} />
        </View>
        <View style={styles.sessionCopy}>
          <View style={styles.sessionTitleRow}>
            <Text style={styles.sessionTitle}>{session.chargerName ?? (session.mode === "charge" ? "Charge session" : "Discharge session")}</Text>
            {session.endAt === null ? <Text style={styles.liveLabel}>LIVE</Text> : null}
            {session.chargerLabel ? <View style={[styles.chargerBadge, chargerBadgeStyle(session.chargerCategory, styles)]}><Text style={styles.chargerBadgeText}>{session.chargerLabel}</Text></View> : null}
          </View>
          <Text style={styles.sessionMeta}>{formatClock(session.startAt)} · {formatDuration(session.durationMinutes)}</Text>
          <Text style={styles.sessionMeta}>{session.startLevel}% {session.endLevel === null ? "→ —" : `→ ${session.endLevel}%`}</Text>
        </View>
        <View style={styles.rate}>
          <Text style={styles.rateValue}>{session.rate === null ? "—" : `${session.rate}`}</Text>
          <Text style={styles.rateLabel}>% / hr</Text>
        </View>
      </Pressable>
    ))}</View>}
    {compareMode && compareIds.length === 2 ? <Pressable testID="run-compare" onPress={() => setCompareIds([...compareIds])} accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, styles.compareCta, pressed && styles.pressed]}>
      <Text style={styles.primaryText}>Compare selected sessions</Text>
    </Pressable> : null}
  </ScrollView>

  <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalShade} />
      <View style={[styles.modal, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Session detail</Text>
          <Pressable onPress={() => setSelected(null)} accessibilityRole="button" style={styles.closeButton}><MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceSecondary} /></Pressable>
        </View>
        {selected ? <>
          <Text style={styles.modalMode}>{selected.mode === "charge" ? "Charging" : "Discharging"} · {selected.confidence} confidence</Text>
          <View style={styles.detailGrid}>
            <Detail label="Started" value={formatClock(selected.startAt)} />
            <Detail label="Ended" value={selected.endAt ? formatClock(selected.endAt) : "In progress"} />
            <Detail label="Change" value={`${selected.startLevel}% → ${selected.endLevel ?? "—"}%`} />
            <Detail label="Duration" value={formatDuration(selected.durationMinutes)} />
            <Detail label="Rate" value={selected.rate === null ? "—" : `${selected.rate}% / hr`} />
            <Detail label="Source" value={selected.chargerType ?? "Battery state"} />
            {selected.chargerName ? <Detail label="Charger" value={selected.chargerName} /> : selected.chargerLabel ? <Detail label="Charger" value={selected.chargerLabel} /> : null}
            {selected.peakCurrentMicroA ? <Detail label="Peak current" value={`${(selected.peakCurrentMicroA / 1000).toFixed(0)} mA`} /> : null}
            {selected.mAhDelta ? <Detail label="mAh drawn" value={`${selected.mAhDelta} mAh`} /> : null}
            {selected.screenOnMinutes != null ? <Detail label="Screen on" value={`${Math.round(selected.screenOnMinutes)}m`} /> : null}
            {selected.screenOffMinutes != null ? <Detail label="Screen off" value={`${Math.round(selected.screenOffMinutes)}m`} /> : null}
            {selected.baselineDeviation != null ? <Detail label="vs baseline" value={`${selected.baselineDeviation > 0 ? "+" : ""}${selected.baselineDeviation.toFixed(0)}%`} /> : null}
          </View>
          {selected.mode === "discharge" && selected.baselineDeviation != null ? (
            <Text style={styles.drainExplainer}>{describeDrainDeviation(selected.baselineDeviation, baseline)}</Text>
          ) : null}
          {selected.topApps && selected.topApps.length > 0 ? (
            <View testID="session-top-apps" style={styles.topApps}>
              <Text style={styles.topAppsTitle}>Top apps this session</Text>
              {selected.topApps.map((app, index) => (
                <View key={app.packageName} style={styles.topAppRow}>
                  <View style={styles.topAppRank}><Text style={styles.topAppRankText}>{index + 1}</Text></View>
                  <View style={styles.topAppCopy}>
                    <Text style={styles.topAppName}>{app.label}</Text>
                    <Text style={styles.topAppMeta}>{app.packageName}</Text>
                  </View>
                  <Text style={styles.topAppValue}>{Math.round(app.minutes)}m{formatDataUsage(app.dataUsageMb) ? ` · ${formatDataUsage(app.dataUsageMb)}` : ""}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <DiaryEditor session={selected} onSave={(patch) => updateSessionDiary(selected.id, patch)} />
          <Text style={styles.confidence}>Estimated figures are labeled with confidence so device-reported approximations stay transparent.</Text>
        </> : null}
      </View>
    </View>
  </Modal>

  <Modal visible={editingCharger !== null} transparent animationType="fade" onRequestClose={closeRename}>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalShade} />
      <View style={[styles.renameCard, { marginBottom: insets.bottom + 40 }]}>
        <Text style={styles.modalTitle}>Rename charger</Text>
        <Text style={styles.renameHint}>Give it a name you&apos;ll recognize, like &quot;Desk fast charger&quot; or &quot;Car USB&quot;.</Text>
        <TextInput
          testID="charger-name-input"
          style={styles.renameInput}
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Charger name"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          onSubmitEditing={commitRename}
          autoFocus
        />
        <View style={styles.renameActions}>
          <Pressable testID="charger-forget" onPress={handleForget} accessibilityRole="button" style={({ pressed }) => [styles.forgetButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="delete-outline" size={16} color={colors.error} />
            <Text style={styles.forgetText}>Forget</Text>
          </Pressable>
          <View style={styles.rightActions}>
            <Pressable onPress={closeRename} accessibilityRole="button" style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
            <Pressable testID="charger-save" onPress={commitRename} accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryText}>Save</Text></Pressable>
          </View>
        </View>
      </View>
    </View>
  </Modal>

  <Modal visible={compareMode && compareIds.length === 2} transparent animationType="slide" onRequestClose={() => setCompareIds([])}>
    <View style={styles.modalBackdrop}>
      <View style={styles.modalShade} />
      <View style={[styles.modal, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Compare sessions</Text>
          <Pressable onPress={() => setCompareIds([])} accessibilityRole="button" style={styles.closeButton}><MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceSecondary} /></Pressable>
        </View>
        {compareSessions.length === 2 ? <>
          <CompareChartFrame
            labelA={formatClock(compareSessions[0].startAt)}
            labelB={formatClock(compareSessions[1].startAt)}
            seriesA={normalizeCurve(compareSessions[0])}
            seriesB={normalizeCurve(compareSessions[1])}
          />
          <View style={styles.detailGrid}>
            <Detail label={`${formatClock(compareSessions[0].startAt)} rate`} value={compareSessions[0].rate === null ? "—" : `${compareSessions[0].rate}% / hr`} />
            <Detail label={`${formatClock(compareSessions[1].startAt)} rate`} value={compareSessions[1].rate === null ? "—" : `${compareSessions[1].rate}% / hr`} />
            <Detail label="Duration A" value={formatDuration(compareSessions[0].durationMinutes)} />
            <Detail label="Duration B" value={formatDuration(compareSessions[1].durationMinutes)} />
          </View>
          {!compareSessions[0].curve || !compareSessions[1].curve ? <Text style={styles.confidence}>One or both sessions predate curve tracking, so their line is a straight estimate between start and end rather than a real curve.</Text> : null}
        </> : null}
      </View>
    </View>
  </Modal>
  </View>;
}

function Detail({ label, value }: { label: string; value: string }) { const styles = useStyles(); return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }

function chargerBadgeStyle(category: ChargerCategory | null, styles: ReturnType<typeof useStyles>) {
  if (category === "fast") return styles.chargerBadgeFast;
  if (category === "standard") return styles.chargerBadgeStandard;
  if (category === "slow") return styles.chargerBadgeSlow;
  return styles.chargerBadgeTrickle;
}

function chargerIconName(plug: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (plug === "wireless") return "cellphone-wireless";
  if (plug === "usb") return "usb-port";
  if (plug === "ac") return "power-plug";
  return "power-plug-outline";
}

function formatChargerMeta(charger: Charger) {
  const plug = charger.plugLabel && charger.plugLabel !== "unknown" ? capitalize(charger.plugLabel) : "Unknown plug";
  const peak = `${charger.avgPeakMa} mA peak`;
  const duration = charger.avgDurationMinutes != null ? ` · avg ${formatDuration(Math.round(charger.avgDurationMinutes))}` : "";
  const uses = `${charger.uses} use${charger.uses === 1 ? "" : "s"}`;
  return `${plug} · ${peak}${duration} · ${uses}`;
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

function DiaryEditor({ session, onSave }: { session: Session; onSave: (patch: { note?: string | null; tags?: string[] | null }) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [note, setNote] = useState(session.note ?? "");
  const [tags, setTags] = useState<string[]>(session.tags ?? []);
  useEffect(() => { setNote(session.note ?? ""); setTags(session.tags ?? []); }, [session.id, session.note, session.tags]);
  const toggleTag = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(next);
    onSave({ tags: next.length > 0 ? next : null });
  };
  return <View testID="session-diary" style={styles.diaryCard}>
    <Text style={styles.diaryTitle}>Diary & tags</Text>
    <View style={styles.diaryChips}>{DIARY_TAG_PRESETS.map((tag) => (
      <Pressable testID={`diary-tag-${tag}`} key={tag} onPress={() => toggleTag(tag)} accessibilityRole="button" style={[styles.diaryChip, tags.includes(tag) && styles.diaryChipOn]}>
        <Text style={[styles.diaryChipText, tags.includes(tag) && styles.diaryChipTextOn]}>{tag}</Text>
      </Pressable>
    ))}</View>
    <TextInput testID="diary-note" value={note} onChangeText={setNote} onBlur={() => onSave({ note: note.trim() ? note.trim() : null })} placeholder="Add a note (e.g. commute home, hot day, GPS run)" placeholderTextColor={colors.muted} multiline style={styles.diaryInput} />
  </View>;
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 20, gap: 18 },
  summary: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 24 },
  summaryKicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: "600" }, summaryValue: { color: colors.brandPrimary, fontSize: 34, fontWeight: "500", marginTop: 3 }, summaryLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "500", marginTop: 7 }, summaryDivider: { width: 1, height: 42, backgroundColor: colors.divider },
  chargerList: { gap: 10 },
  chargerCard: { minHeight: 72, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 12 },
  chargerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chargerCopy: { flex: 1, gap: 4 },
  chargerName: { color: colors.onSurface, fontSize: 15, fontWeight: "500" },
  chargerMeta: { color: colors.muted, fontSize: 12 },
  list: { gap: 10 }, sessionRow: { minHeight: 96, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 12 }, sessionRowSelected: { borderColor: colors.brandPrimary, borderWidth: 2 }, pressed: { opacity: 0.72 }, sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -6 }, compareToggle: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, justifyContent: "center" }, compareToggleOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary }, compareToggleText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" }, compareToggleTextOn: { color: colors.brandPrimary }, compareCta: { marginTop: 4 }, sessionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }, chargeIcon: { backgroundColor: colors.brandTertiary }, dischargeIcon: { backgroundColor: colors.surfaceTertiary }, sessionCopy: { flex: 1, gap: 4 }, sessionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }, sessionTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "500" }, liveLabel: { color: colors.success, fontSize: 10, fontWeight: "600", letterSpacing: 0.8 }, sessionMeta: { color: colors.muted, fontSize: 12 }, rate: { alignItems: "flex-end" }, rateValue: { color: colors.brandPrimary, fontSize: 20, fontWeight: "500" }, rateLabel: { color: colors.muted, fontSize: 10 },
  chargerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 }, chargerBadgeText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.4, color: colors.onSurface }, chargerBadgeFast: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary }, chargerBadgeStandard: { backgroundColor: colors.surfaceTertiary, borderColor: colors.info }, chargerBadgeSlow: { backgroundColor: colors.surfaceTertiary, borderColor: colors.warning }, chargerBadgeTrickle: { backgroundColor: colors.surfaceTertiary, borderColor: colors.divider },
  modalBackdrop: { flex: 1, backgroundColor: colors.surface, justifyContent: "flex-end" }, modalShade: { ...StyleSheet.absoluteFill, backgroundColor: colors.surfaceInverse, opacity: 0.72 }, modal: { minHeight: "50%", backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }, modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 18 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "500" }, closeButton: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" }, modalMode: { color: colors.brandPrimary, fontSize: 13, marginTop: 8, marginBottom: 22 }, detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, detail: { width: "47%", backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 12, gap: 5 }, detailLabel: { color: colors.muted, fontSize: 11 }, detailValue: { color: colors.onSurface, fontSize: 14, fontWeight: "500" }, drainExplainer: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: 14 }, confidence: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18, marginTop: 24 },
  topApps: { marginTop: 20, gap: 8 },
  topAppsTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "600", letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase" },
  topAppRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceTertiary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  topAppRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  topAppRankText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  topAppCopy: { flex: 1, gap: 2 },
  topAppName: { color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  topAppMeta: { color: colors.muted, fontSize: 10 },
  topAppValue: { color: colors.brandPrimary, fontSize: 14, fontWeight: "600" },
  diaryCard: { marginTop: 20, gap: 10 },
  diaryTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  diaryChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  diaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  diaryChipOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  diaryChipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "500" },
  diaryChipTextOn: { color: colors.brandPrimary },
  diaryInput: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: 10, padding: 12, minHeight: 68, fontSize: 13, textAlignVertical: "top" },
  renameCard: { marginHorizontal: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 20, gap: 14 },
  renameHint: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  renameInput: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.onSurface, fontSize: 15, backgroundColor: colors.surface },
  renameActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  rightActions: { flexDirection: "row", gap: 10 },
  forgetButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  forgetText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  secondaryButton: { minHeight: 44, minWidth: 70, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceTertiary },
  secondaryText: { color: colors.onSurface, fontSize: 13, fontWeight: "500" },
  primaryButton: { minHeight: 44, minWidth: 70, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.brandPrimary },
  primaryText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "600" },
}))