import * as Battery from "expo-battery";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  BatteryMode,
  BatteryStatus,
  Capabilities,
  Charger,
  CHARGER_STORAGE_KEY,
  classifyCharger,
  CycleSettings,
  defaultSettings,
  formatDuration,
  localDateKey,
  PersistedPowerState,
  POWER_STATE_STORAGE_KEY,
  powerStateFromMode,
  ScreenDaily,
  SCREEN_DAILY_STORAGE_KEY,
  Session,
  SESSION_HISTORY_LIMIT,
  SESSION_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from "@/src/data/cyclesense";
import { detectCapabilities, NO_CAPABILITIES } from "@/src/data/capabilities";
import {
  baselineDeviation,
  computeBaseline,
  computeMAhDelta,
  estimateTimeToFullFromBattery,
  estimateTimeToFullFromSamples,
  isRealCurrentReading,
} from "@/src/data/analytics";
import { computeBatteryHealth } from "@/src/data/health";
import {
  ChargerFingerprint,
  createChargerFromFingerprint,
  findMatchingCharger,
  guessChargerAtStart,
  mergeChargerFingerprint,
  suggestChargerName,
} from "@/src/data/charger-memory";
import { ensureNotifications, sendBatteryAlert } from "@/src/notifications";
import { CycleSenseNative, NativeBatteryTelemetry, NativeUsageEvent, ScreenChange } from "@/modules/cyclesense-native/src";
import { storage } from "@/src/utils/storage";

const NATIVE_ACTIVE = Platform.OS === "android" && CycleSenseNative.isNative;
const capSessions = (list: Session[]): Session[] => (list.length > SESSION_HISTORY_LIMIT ? list.slice(0, SESSION_HISTORY_LIMIT) : list);
const LIVE_CHARGE_SAMPLE_LIMIT = 12;

function updateLiveChargeSamples(
  samples: NativeBatteryTelemetry[],
  telemetry: NativeBatteryTelemetry,
): NativeBatteryTelemetry[] {
  if (telemetry.statusLabel !== "charging" || telemetry.levelPercent < 0 || !Number.isFinite(telemetry.timestamp)) return [];
  const byTimestamp = new Map(samples.map((sample) => [sample.timestamp, sample]));
  byTimestamp.set(telemetry.timestamp, telemetry);
  return [...byTimestamp.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-LIVE_CHARGE_SAMPLE_LIMIT);
}

// Backfill new optional fields on sessions loaded from an older schema so the
// UI never has to guard against undefined vs null on P2-era columns.
function normalizeSession(session: Partial<Session>): Session {
  return {
    ...(session as Session),
    screenOnMinutes: session.screenOnMinutes ?? null,
    screenOffMinutes: session.screenOffMinutes ?? null,
    chargerId: session.chargerId ?? null,
    chargerName: session.chargerName ?? null,
    startVoltageMv: session.startVoltageMv ?? null,
    peakCurrentMicroA: session.peakCurrentMicroA ?? null,
    startChargeCounterMicroAh: session.startChargeCounterMicroAh ?? null,
    endChargeCounterMicroAh: session.endChargeCounterMicroAh ?? null,
    mAhDelta: session.mAhDelta ?? null,
    topApps: session.topApps ?? null,
    baselineDeviation: session.baselineDeviation ?? null,
    tags: session.tags ?? null,
  };
}
const normalizeSessions = (list: Partial<Session>[]): Session[] => list.map(normalizeSession);

function readMode(state: Battery.BatteryState): BatteryMode {
  if (state === Battery.BatteryState.CHARGING) return "charging";
  if (state === Battery.BatteryState.FULL) return "full";
  if (state === Battery.BatteryState.UNPLUGGED) return "discharging";
  return "unknown";
}

function mapNativeStatus(telemetry: NativeBatteryTelemetry): BatteryStatus {
  const mode: BatteryMode =
    telemetry.statusLabel === "charging" ? "charging" :
    telemetry.statusLabel === "full" ? "full" :
    telemetry.statusLabel === "discharging" || telemetry.statusLabel === "not_charging" ? "discharging" :
    "unknown";
  return {
    available: telemetry.available,
    level: telemetry.level >= 0 ? telemetry.level : null,
    mode,
    lowPowerMode: false,
    updatedAt: new Date(telemetry.timestamp || Date.now()).toISOString(),
    temperatureCelsius: telemetry.temperatureCelsius ?? null,
    voltageMv: telemetry.voltageMv > 0 ? telemetry.voltageMv : null,
    currentNowMicroA: isRealCurrentReading(telemetry.currentNowMicroA) ? telemetry.currentNowMicroA : null,
    currentAverageMicroA: isRealCurrentReading(telemetry.currentAverageMicroA) ? telemetry.currentAverageMicroA : null,
    chargeCounterMicroAh: telemetry.chargeCounterMicroAh > 0 ? telemetry.chargeCounterMicroAh : null,
    chargeTimeRemainingMs: telemetry.chargeTimeRemainingMs >= 0 ? telemetry.chargeTimeRemainingMs : null,
    technology: telemetry.technology ?? null,
    healthLabel: telemetry.healthLabel ?? null,
    pluggedLabel: telemetry.pluggedLabel ?? null,
    nativeBridge: true,
    cycleCount: telemetry.cycleCount >= 0 ? telemetry.cycleCount : null,
    designCapacityMah: telemetry.designCapacityMah > 0 ? telemetry.designCapacityMah : null,
    manufacturer: telemetry.manufacturer || null,
    modelName: telemetry.modelName || null,
  };
}

export function useCycleSense() {
  const [status, setStatus] = useState<BatteryStatus>({ available: false, level: null, mode: "unknown", lowPowerMode: false, updatedAt: null });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<CycleSettings>(defaultSettings);
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [chargerGreeting, setChargerGreeting] = useState<{ name: string; kind: "known" | "new"; category?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>(NO_CAPABILITIES);
  const [samples, setSamples] = useState<NativeBatteryTelemetry[]>([]);
  const [liveChargeSamples, setLiveChargeSamples] = useState<NativeBatteryTelemetry[]>([]);
  const [screenDaily, setScreenDaily] = useState<ScreenDaily>({ date: localDateKey(), totalOnMinutes: 0, longestOnMinutes: 0 });
  const sessionsRef = useRef<Session[]>([]);
  const runningPeakCurrent = useRef<number>(0);
  const previousMode = useRef<BatteryMode | null>(null);
  const autoTransitionBusy = useRef(false);
  const reconciledOnBoot = useRef(false);
  const screenOnSinceMs = useRef<number | null>(null);
  const screenOnCurrentSessionMs = useRef<number>(0);
  const currentLongestOnMs = useRef<number>(0);
  const chargeLatch = useRef<boolean>(false);
  const dischargeLatch = useRef<boolean>(false);
  const previousLevel = useRef<number | null>(null);
  const persistChargers = useCallback(async (next: Charger[]) => {
    await storage.setItem(CHARGER_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const reloadSessions = useCallback(async () => {
    const storedSessions = await storage.getItem(SESSION_STORAGE_KEY, "[]");
    try {
      const loaded = capSessions(normalizeSessions(JSON.parse(storedSessions || "[]") as Partial<Session>[]));
      sessionsRef.current = loaded;
      setSessions(loaded);
    } catch {
      sessionsRef.current = [];
      setSessions([]);
    }
  }, []);

  const reloadSettings = useCallback(async () => {
    const storedSettings = await storage.getItem(SETTINGS_STORAGE_KEY, JSON.stringify(defaultSettings));
    try {
      setSettings({ ...defaultSettings, ...(JSON.parse(storedSettings || "{}") as CycleSettings) });
    } catch {
      setSettings(defaultSettings);
    }
  }, []);

  const persistSessions = useCallback(async (next: Session[]) => {
    const capped = capSessions(next);
    await storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(capped));
    return capped;
  }, []);

  const commitSessions = useCallback(async (next: Session[]) => {
    const capped = capSessions(next);
    sessionsRef.current = capped;
    setSessions(capped);
    await persistSessions(capped);
    return capped;
  }, [persistSessions]);

  const refresh = useCallback(async () => {
    try {
      if (NATIVE_ACTIVE) {
        const telemetry = await CycleSenseNative.getBatteryTelemetry();
        setStatus(mapNativeStatus(telemetry));
        setCapabilities(detectCapabilities(telemetry, true));
        return;
      }
      const available = await Battery.isAvailableAsync();
      if (!available) {
        setStatus((current) => ({ ...current, available: false, updatedAt: new Date().toISOString() }));
        return;
      }
      const power = await Battery.getPowerStateAsync();
      setStatus({ available: true, level: power.batteryLevel >= 0 ? power.batteryLevel : null, mode: readMode(power.batteryState), lowPowerMode: power.lowPowerMode, updatedAt: new Date().toISOString(), nativeBridge: false });
    } catch {
      setStatus((current) => ({ ...current, available: false, updatedAt: new Date().toISOString() }));
    }
  }, []);

  const refreshSamples = useCallback(async () => {
    if (!NATIVE_ACTIVE) return;
    try {
      const list = await CycleSenseNative.getSamples(200);
      setSamples(list);
    } catch {
      // native module returned non-array; keep last samples
    }
  }, []);

  // Persist a screen-on interval into the daily total + current session
  // accumulator, ONLY when the screen actually turns off.
  const flushScreenOnInterval = useCallback((now: number) => {
    const startedAt = screenOnSinceMs.current;
    if (startedAt === null) return;
    const deltaMs = Math.max(0, now - startedAt);
    if (deltaMs <= 0) {
      screenOnSinceMs.current = null;
      return;
    }
    screenOnCurrentSessionMs.current += deltaMs;
    if (deltaMs > currentLongestOnMs.current) currentLongestOnMs.current = deltaMs;
    screenOnSinceMs.current = null;
    const today = localDateKey(new Date(now));
    setScreenDaily((current) => {
      const base = current.date === today ? current : { date: today, totalOnMinutes: 0, longestOnMinutes: 0 };
      const deltaMinutes = deltaMs / 60000;
      const nextTotal = base.totalOnMinutes + deltaMinutes;
      const nextLongest = Math.max(base.longestOnMinutes, deltaMinutes);
      const next: ScreenDaily = { date: today, totalOnMinutes: Number(nextTotal.toFixed(2)), longestOnMinutes: Number(nextLongest.toFixed(2)) };
      storage.setItem(SCREEN_DAILY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

    // The persisted screenDaily total only updates when the screen turns off
  // (see flushScreenOnInterval below), so on its own it looks frozen while
  // the screen is currently on. This ticks a re-render every 30s so the UI
  // can add the still-running interval on top of the last committed total.
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLiveTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const screenDailyLive = useMemo(() => {
    if (screenOnSinceMs.current === null) return screenDaily;
    const today = localDateKey();
    if (screenDaily.date !== today) return screenDaily; // new day; next flush resets it correctly
    const liveMinutes = Math.max(0, (Date.now() - screenOnSinceMs.current) / 60000);
    return {
      date: screenDaily.date,
      totalOnMinutes: Number((screenDaily.totalOnMinutes + liveMinutes).toFixed(2)),
      longestOnMinutes: Math.max(screenDaily.longestOnMinutes, Number(liveMinutes.toFixed(2))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenDaily, liveTick]);
  const handleScreenChange = useCallback((change: ScreenChange) => {
    if (change.screenOn) {
      if (screenOnSinceMs.current === null) screenOnSinceMs.current = change.timestamp;
    } else {
      flushScreenOnInterval(change.timestamp);
    }
  }, [flushScreenOnInterval]);

  useEffect(() => {
    let active = true;
    (async () => {
      const storedSettings = await storage.getItem(SETTINGS_STORAGE_KEY, JSON.stringify(defaultSettings));
      const storedChargersRaw = await storage.getItem(CHARGER_STORAGE_KEY, "[]");
      const storedScreenDaily = await storage.getItem(SCREEN_DAILY_STORAGE_KEY, JSON.stringify({ date: localDateKey(), totalOnMinutes: 0, longestOnMinutes: 0 }));
      if (active) {
        try {
          const storedSessions = await storage.getItem(SESSION_STORAGE_KEY, "[]");
          const loaded = capSessions(normalizeSessions(JSON.parse(storedSessions || "[]") as Partial<Session>[]));
          sessionsRef.current = loaded;
          setSessions(loaded);
          setSettings({ ...defaultSettings, ...(JSON.parse(storedSettings || "{}") as CycleSettings) });
          setChargers(JSON.parse(storedChargersRaw || "[]") as Charger[]);
          const parsedDaily = JSON.parse(storedScreenDaily || "{}") as ScreenDaily;
          setScreenDaily(parsedDaily.date === localDateKey() ? parsedDaily : { date: localDateKey(), totalOnMinutes: 0, longestOnMinutes: 0 });
        } catch {
          sessionsRef.current = [];
          setSessions([]);
          setSettings(defaultSettings);
          setChargers([]);
        }
        setReady(true);
      }
      // Refresh telemetry, then detect capabilities from first snapshot
      if (NATIVE_ACTIVE) {
        try {
          const telemetry = await CycleSenseNative.getBatteryTelemetry();
          if (active) {
            setStatus(mapNativeStatus(telemetry));
            setCapabilities(detectCapabilities(telemetry, true));
            setLiveChargeSamples((current) => updateLiveChargeSamples(current, telemetry));
          }
          const initial = await CycleSenseNative.getSamples(200);
          if (active) setSamples(initial);
          const on = await CycleSenseNative.isScreenOn();
          if (active) {
            screenOnSinceMs.current = on ? Date.now() : null;
          }
        } catch {
          if (active) setCapabilities(NO_CAPABILITIES);
        }
      } else {
        await refresh();
      }
    })();

    let telemetrySubscription: { remove: () => void } | undefined;
    let levelSubscription: { remove: () => void } | undefined;
    let stateSubscription: { remove: () => void } | undefined;
    let screenSubscription: { remove: () => void } | undefined;

    if (NATIVE_ACTIVE) {
      telemetrySubscription = CycleSenseNative.addTelemetryListener((telemetry) => {
        setStatus(mapNativeStatus(telemetry));
        setLiveChargeSamples((current) => updateLiveChargeSamples(current, telemetry));
      });
      screenSubscription = CycleSenseNative.addScreenChangeListener(handleScreenChange);
    } else if (Platform.OS !== "web" && typeof Battery.addBatteryLevelListener === "function" && typeof Battery.addBatteryStateListener === "function") {
      levelSubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => setStatus((current) => ({ ...current, level: batteryLevel >= 0 ? batteryLevel : null, updatedAt: new Date().toISOString() })));
      stateSubscription = Battery.addBatteryStateListener(({ batteryState }) => setStatus((current) => ({ ...current, mode: readMode(batteryState), updatedAt: new Date().toISOString() })));
    }
    return () => {
      active = false;
      telemetrySubscription?.remove();
      levelSubscription?.remove();
      stateSubscription?.remove();
      screenSubscription?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const openSession = useMemo(() => sessions.find((session) => session.endAt === null) ?? null, [sessions]);

  useEffect(() => {
    if (!openSession) {
      runningPeakCurrent.current = 0;
      return;
    }
    if (status.currentNowMicroA != null) {
      const magnitude = Math.abs(status.currentNowMicroA);
      if (magnitude > runningPeakCurrent.current) runningPeakCurrent.current = magnitude;
    }
  }, [openSession, status.currentNowMicroA]);

  const startSession = useCallback(async () => {
    const isCharge = status.mode === "charging" || status.mode === "full";
    const plugLabel = status.pluggedLabel ?? null;
    const guessed = isCharge ? guessChargerAtStart(plugLabel, status.voltageMv ?? null, chargers) : null;
    const next: Session = {
      id: `session-${Date.now()}`,
      mode: isCharge ? "charge" : "discharge",
      startAt: new Date().toISOString(),
      endAt: null,
      startLevel: status.level === null ? 0 : Math.round(status.level * 100),
      endLevel: null,
      durationMinutes: null,
      rate: null,
      confidence: status.available ? (status.nativeBridge ? "High" : "Medium") : "Low",
      chargerType: status.mode === "charging" ? status.pluggedLabel ?? "System reported" : null,
      chargerLabel: null,
      chargerCategory: null,
      chargerId: guessed?.id ?? null,
      chargerName: guessed?.name ?? null,
      startVoltageMv: status.voltageMv ?? null,
      peakCurrentMicroA: status.currentNowMicroA ?? null,
      screenOnMinutes: null,
      screenOffMinutes: null,
      startChargeCounterMicroAh: status.chargeCounterMicroAh ?? null,
      endChargeCounterMicroAh: null,
      mAhDelta: null,
      topApps: null,
      baselineDeviation: null,
      note: null,
      tags: null,
      curve: null,
    };
    // Reset per-session screen accumulators; keep the running "on" stopwatch
    // so if the screen was already on when the session began, we still credit
    // the time from now on.
    screenOnCurrentSessionMs.current = 0;
    currentLongestOnMs.current = 0;
    if (screenOnSinceMs.current !== null) screenOnSinceMs.current = Date.now();
    await commitSessions([next, ...sessionsRef.current]);
    const persisted: PersistedPowerState = {
      state: powerStateFromMode(status.mode),
      atIso: next.startAt,
      levelPercent: next.startLevel,
    };
    await storage.setItem(POWER_STATE_STORAGE_KEY, JSON.stringify(persisted));
    if (isCharge && guessed) {
      setChargerGreeting({ name: guessed.name, kind: "known", category: guessed.category });
    }
    if (NATIVE_ACTIVE) {
      // Home-screen launcher icon reflects real state: green while charging,
      // amber while draining. Cosmetic only - failures here never block
      // session tracking (see setDynamicIcon's own try/catch on the native side).
      try {
        await CycleSenseNative.setDynamicIconState(isCharge);
      } catch (error) {
        console.error("[CycleSense] Could not update the launcher icon.", error);
      }
    }
  }, [chargers, commitSessions, status]);

  const endSession = useCallback(async () => {
    if (!openSession) return;
    const endLevel = status.level === null ? openSession.startLevel : Math.round(status.level * 100);
    const durationMinutes = Math.max(1, Math.round((Date.now() - new Date(openSession.startAt).getTime()) / 60000));
    const delta = openSession.mode === "discharge" ? openSession.startLevel - endLevel : endLevel - openSession.startLevel;
    const rate = Number((delta / (durationMinutes / 60)).toFixed(1));
    const peakCurrent = Math.max(
      openSession.peakCurrentMicroA ?? 0,
      runningPeakCurrent.current,
      status.currentNowMicroA ? Math.abs(status.currentNowMicroA) : 0,
    ) || null;
    const plugLabel = status.pluggedLabel ?? openSession.chargerType;
    const { label, category } = classifyCharger({
      mode: openSession.mode,
      rate,
      peakCurrentMicroA: peakCurrent,
      pluggedLabel: plugLabel,
    });
    let chargerId = openSession.chargerId ?? null;
    let chargerName = openSession.chargerName ?? null;
    let updatedChargers = chargers;
    if (openSession.mode === "charge" && category && peakCurrent && peakCurrent > 0) {
      const fingerprint: ChargerFingerprint = {
        category,
        plugLabel: plugLabel && plugLabel !== "unplugged" ? plugLabel : "unknown",
        peakMa: peakCurrent / 1000,
        voltageMv: openSession.startVoltageMv ?? status.voltageMv ?? null,
        durationMinutes,
      };
      const matched = findMatchingCharger(fingerprint, chargers);
      if (matched) {
        const merged = mergeChargerFingerprint(matched, fingerprint);
        updatedChargers = chargers.map((c) => (c.id === matched.id ? merged : c));
        chargerId = merged.id;
        chargerName = merged.name;
        if (openSession.chargerId !== merged.id) {
          setChargerGreeting({ name: merged.name, kind: "known", category: merged.category });
        }
      } else {
        const name = suggestChargerName(fingerprint, chargers);
        const created = createChargerFromFingerprint(fingerprint, name);
        updatedChargers = [created, ...chargers];
        chargerId = created.id;
        chargerName = created.name;
        setChargerGreeting({ name: created.name, kind: "new", category: created.category });
      }
      setChargers(updatedChargers);
      await persistChargers(updatedChargers);
    }
    // Flush any in-progress screen-on interval so the closing session gets credit
    if (screenOnSinceMs.current !== null) flushScreenOnInterval(Date.now());
    const screenOnMinutes = openSession.mode === "discharge" ? Number((screenOnCurrentSessionMs.current / 60000).toFixed(2)) : null;
    const screenOffMinutes = openSession.mode === "discharge" && screenOnMinutes !== null ? Math.max(0, Number((durationMinutes - screenOnMinutes).toFixed(2))) : null;
    // Restart the "on" stopwatch if screen is currently on so the next session starts clean
    if (screenOnSinceMs.current !== null) screenOnSinceMs.current = Date.now();
    screenOnCurrentSessionMs.current = 0;
    currentLongestOnMs.current = 0;
    const endChargeCounterMicroAh = status.chargeCounterMicroAh ?? null;
    const mAhDelta = openSession.mode === "discharge" ? computeMAhDelta(openSession.startChargeCounterMicroAh, endChargeCounterMicroAh) : null;
    // Baseline deviation is computed against the closed session archive
    // (which does not yet include this one) so a repeat pattern doesn't
    // suppress its own anomaly signal.
    const baseline = openSession.mode === "discharge" ? computeBaseline(sessions.filter((s) => s.id !== openSession.id)) : null;
    const deviation = openSession.mode === "discharge" ? baselineDeviation(rate, baseline) : null;
    // Fetch usage correlation for discharge sessions when Usage access is granted
    let topApps: Session["topApps"] = null;
    if (openSession.mode === "discharge" && NATIVE_ACTIVE) {
      try {
        const granted = await CycleSenseNative.hasUsageStatsPermission();
        if (granted) {
          const events: NativeUsageEvent[] = await CycleSenseNative.getUsageEvents(new Date(openSession.startAt).getTime(), Date.now());
          topApps = events.slice(0, 3).map((e) => ({ packageName: e.packageName, label: e.label, minutes: Number((e.foregroundMs / 60000).toFixed(1)) }));
        }
      } catch {
        // ignore usage-events failures
      }
    }
    // Slice the shared rolling telemetry buffer down to just this session's
    // window - samples already exist in memory (native ring buffer mirrored
    // every 60s), so no new native code is needed to capture this.
    const sessionStartMs = new Date(openSession.startAt).getTime();
    const curve = samples
      .filter((s) => s.timestamp >= sessionStartMs && s.levelPercent >= 0)
      .map((s) => ({ t: s.timestamp, level: s.levelPercent }))
      .sort((a, b) => a.t - b.t);
    const nextSessions = sessionsRef.current.map((session) => session.id === openSession.id ? { ...session, endAt: new Date().toISOString(), endLevel, durationMinutes, rate, peakCurrentMicroA: peakCurrent, chargerLabel: label, chargerCategory: category, chargerId, chargerName, screenOnMinutes, screenOffMinutes, endChargeCounterMicroAh, mAhDelta, topApps, baselineDeviation: deviation, curve: curve.length > 0 ? curve : null } : session);
    await commitSessions(nextSessions);
    const persistedState: PersistedPowerState = {
      state: powerStateFromMode(status.mode),
      atIso: new Date().toISOString(),
      levelPercent: endLevel,
    };
    await storage.setItem(POWER_STATE_STORAGE_KEY, JSON.stringify(persistedState));
  }, [chargers, commitSessions, flushScreenOnInterval, openSession, persistChargers, samples, sessions, status]);

  // Auto-track plug/unplug: plug in → open a charge session; unplug → close
  // whatever session is running. The user can still tap the Dashboard button
  // as an override for discharge tracking or ad-hoc sessions.
  useEffect(() => {
    if (!ready) return;
    const current = status.mode;
    if (current === "unknown") return;
    const prev = previousMode.current;
    if (prev === null) {
      previousMode.current = current;
      return;
    }
    if (prev === current) return;
    const wasCharging = prev === "charging" || prev === "full";
    const isCharging = current === "charging" || current === "full";
    previousMode.current = current;
    if (wasCharging === isCharging) return; // charging ↔ full is not a plug transition
    if (autoTransitionBusy.current) return;
    autoTransitionBusy.current = true;
    const percent = status.level === null ? null : Math.round(status.level * 100);
    (async () => {
      try {
        if (openSession) await endSession();
        if (isCharging) await startSession();
        // Optional audible cue on plug/unplug via the local notification
        // channel - respects DND because it uses the standard system channel.
        if (settings.soundCues) {
          const ok = await ensureNotifications(true);
          if (ok) await sendBatteryAlert(isCharging ? "plug" : "unplug", percent, true);
        }
      } catch (error) {
        console.error("[CycleSense] Could not process a battery power transition.", error);
      } finally {
        autoTransitionBusy.current = false;
      }
    })();
  }, [ready, status.mode, status.level, openSession, endSession, startSession, settings.soundCues]);

  // Reconciliation on cold start: sessions are otherwise only ever created
  // by the auto-transition effect witnessing an actual mode CHANGE while the
  // app is alive - which means a state the app was never alive to see the
  // *start* of (a fresh install, or any relaunch after Android killed a
  // backgrounded app mid-charge) would never get recorded at all. This
  // effect adopts whatever the phone is actually doing right now as a fresh
  // session whenever there isn't already a correctly-matching one open, so
  // intermittent app usage can't silently produce zero recorded sessions
  // despite real charge/discharge cycles happening.
  useEffect(() => {
    if (!ready) return;
    if (reconciledOnBoot.current) return;
    if (status.mode === "unknown") return;
    reconciledOnBoot.current = true;
    (async () => {
      try {
        const raw = await storage.getItem(POWER_STATE_STORAGE_KEY, "null");
        const persisted = raw && raw !== "null" ? (JSON.parse(raw) as PersistedPowerState) : null;
        const observed = powerStateFromMode(status.mode);
        const open = sessions.find((s) => s.endAt === null) ?? null;
        const openMatchesReality = open != null && (open.mode === "charge") === (observed === "CHARGING");

        // Case 1: an open session exists but conflicts with reality → close it.
        if (open && !openMatchesReality) {
          await endSession();
        }
        // Case 2: nothing open correctly reflects the current real state
        // (either nothing was open, or we just closed the one that didn't
        // match) and the phone is actively charging or discharging right
        // now → adopt it as a fresh session, starting from this moment.
        // This can't recover the true start time/level of a cycle the app
        // wasn't alive to see begin, but it's the difference between
        // recording *something* real going forward and recording nothing.
        if (!openMatchesReality && observed !== "IDLE") {
          await startSession();
        }

        // Persist current state so the next boot has a fresh anchor
        const next: PersistedPowerState = { state: observed, atIso: new Date().toISOString(), levelPercent: status.level === null ? null : Math.round(status.level * 100) };
        if (!persisted || persisted.state !== next.state) {
          await storage.setItem(POWER_STATE_STORAGE_KEY, JSON.stringify(next));
        }
        // Icon should match reality from the moment the app first observes
        // it too, not just on the next plug/unplug transition.
        if (NATIVE_ACTIVE) {
          await CycleSenseNative.setDynamicIconState(observed === "CHARGING");
        }
      } catch (error) {
        console.error("[CycleSense] Could not reconcile the active battery session.", error);
      }
    })();
  }, [ready, status.mode, status.level, sessions, endSession, startSession]);

  // Periodic pull of raw samples on Android. WorkManager writes into a native
  // ring buffer every 15 min - we mirror it into JS so Insights and the
  // curve chart have current data without hammering the bridge.
  useEffect(() => {
    if (!NATIVE_ACTIVE) return;
    refreshSamples();
    const interval = setInterval(refreshSamples, 60_000);
    return () => clearInterval(interval);
  }, [refreshSamples]);

  // Initialize notification permission + channel once the user's audible-cue
  // preference is known.
  useEffect(() => {
    if (!ready) return;
    ensureNotifications(settings.soundCues);
    // Mirror the audible-cue preference into the native prefs so the
    // manifest-registered PowerBroadcastReceiver can respect it even when
    // the JS process has been killed.
    if (NATIVE_ACTIVE) CycleSenseNative.setSoundCuesEnabled(settings.soundCues);
  }, [ready, settings.soundCues]);

  // Keep the home-screen widget in sync with the app-visible state. Cheap
  // to call on every observable change - the native side writes to prefs
  // and calls updateAppWidget for whichever widgets the user has placed.
  useEffect(() => {
    if (!ready) return;
    if (!NATIVE_ACTIVE) return;
    const level = status.level === null ? -1 : Math.round(status.level * 100);
    const rate = openSession?.rate ?? 0;
    const mode = status.mode;
    const chargerName = openSession?.chargerName ?? chargers[0]?.name ?? null;
    CycleSenseNative.updateWidget(level, rate, mode, chargerName);
  }, [ready, status.level, status.mode, openSession, chargers]);

  // Threshold notifications: fire when the level crosses the user-configured
  // charge (rising) or discharge (falling) target. Latches re-arm only when
  // the level moves back away from the threshold, so alerts never repeat on
  // every battery-event tick.
  useEffect(() => {
    if (!ready) return;
    if (status.level === null) return;
    const percent = Math.round(status.level * 100);
    const previous = previousLevel.current;
    previousLevel.current = percent;
    if (previous === null) return;

    // Re-arm latches when the level moves back into the safe band.
    if (percent < settings.chargeAlert - 1) chargeLatch.current = false;
    if (percent > settings.dischargeAlert + 1) dischargeLatch.current = false;

    const isCharging = status.mode === "charging" || status.mode === "full";
    const isDischarging = status.mode === "discharging";

    if (isCharging && !chargeLatch.current && previous < settings.chargeAlert && percent >= settings.chargeAlert) {
      chargeLatch.current = true;
      ensureNotifications(settings.soundCues).then((ok) => { if (ok) sendBatteryAlert("charge", percent, settings.soundCues); });
    }
    if (isDischarging && !dischargeLatch.current && previous > settings.dischargeAlert && percent <= settings.dischargeAlert) {
      dischargeLatch.current = true;
      ensureNotifications(settings.soundCues).then((ok) => { if (ok) sendBatteryAlert("discharge", percent, settings.soundCues); });
    }
  }, [ready, status.level, status.mode, settings.chargeAlert, settings.dischargeAlert, settings.soundCues]);

  const updateSessionDiary = useCallback(async (id: string, patch: { note?: string | null; tags?: string[] | null }) => {
    const next = sessionsRef.current.map((session) => session.id === id ? { ...session, ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.tags !== undefined ? { tags: patch.tags } : {}) } : session);
    await commitSessions(next);
  }, [commitSessions]);

  const renameCharger = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = chargers.map((c) => c.id === id ? { ...c, name: trimmed } : c);
    setChargers(next);
    await persistChargers(next);
    const patched = sessionsRef.current.map((session) => session.chargerId === id ? { ...session, chargerName: trimmed } : session);
    await commitSessions(patched);
  }, [chargers, commitSessions, persistChargers]);

  const forgetCharger = useCallback(async (id: string) => {
    const next = chargers.filter((c) => c.id !== id);
    setChargers(next);
    await persistChargers(next);
  }, [chargers, persistChargers]);

  const dismissChargerGreeting = useCallback(() => setChargerGreeting(null), []);

  const baseline = useMemo(() => computeBaseline(sessions), [sessions]);
  const batteryHealth = useMemo(
    () => computeBatteryHealth(sessions, status.designCapacityMah),
    [sessions, status.designCapacityMah],
  );
  const timeToFullEstimate = useMemo(() => {
    const isCharging = status.mode === "charging" || status.mode === "full";
    if (!isCharging) return null;
    const levelPercent = status.level === null ? -1 : Math.round(status.level * 100);
    if (levelPercent < 0) return null;
    if (status.mode === "full") return { minutes: 0, source: "full" as const };
    return estimateTimeToFullFromBattery({
      currentLevelPercent: levelPercent,
      designCapacityMah: status.designCapacityMah,
      chargeCounterMicroAh: status.chargeCounterMicroAh,
      currentAverageMicroA: status.currentAverageMicroA,
      currentNowMicroA: status.currentNowMicroA,
      androidEstimateMs: status.chargeTimeRemainingMs,
    }) ?? estimateTimeToFullFromSamples(
      liveChargeSamples.length > 0 ? liveChargeSamples : samples,
      levelPercent,
    );
  }, [
    liveChargeSamples,
    samples,
    status.mode,
    status.level,
    status.designCapacityMah,
    status.chargeCounterMicroAh,
    status.currentAverageMicroA,
    status.currentNowMicroA,
    status.chargeTimeRemainingMs,
  ]);
  const timeToFullMinutes = timeToFullEstimate?.minutes ?? null;

  const updateSettings = useCallback(async (patch: Partial<CycleSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    if (NATIVE_ACTIVE && typeof patch.backgroundSampling === "boolean") {
      if (patch.backgroundSampling) await CycleSenseNative.startBackgroundSampling(CycleSenseNative.minIntervalMinutes);
      else await CycleSenseNative.stopBackgroundSampling();
    }
  }, [settings]);

  const exportCsv = useCallback(async () => {
    const header = "session_id,mode,start_time,end_time,start_percent,end_percent,duration_minutes,rate_percent_per_hour,confidence,charger_type,charger_name,screen_on_minutes,screen_off_minutes,note";
    const rows = sessions.map((session) => [session.id, session.mode, session.startAt, session.endAt ?? "", session.startLevel, session.endLevel ?? "", session.durationMinutes ?? "", session.rate ?? "", session.confidence, session.chargerType ?? "", session.chargerName ?? "", session.screenOnMinutes ?? "", session.screenOffMinutes ?? "", session.note ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    const csv = [header, ...rows].join("\n");
    if (Platform.OS === "web" || !FileSystem.documentDirectory) return { ok: false, reason: "Sharing is available from the Android share sheet." };
    const uri = `${FileSystem.documentDirectory}cyclesense-sessions.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export CycleSense sessions" });
      return { ok: true, reason: "CSV shared" };
    }
    return { ok: false, reason: "Sharing is not available on this device." };
  }, [sessions]);

  const requestUsageStats = useCallback(async () => {
    if (!NATIVE_ACTIVE) return { granted: false, reason: "Available on Android device builds only." };
    const already = await CycleSenseNative.hasUsageStatsPermission();
    if (already) return { granted: true, reason: "Permission already granted." };
    await CycleSenseNative.openUsageStatsSettings();
    return { granted: false, reason: "Opened Usage access settings. Re-check after granting." };
  }, []);

  const hasUsageStatsPermission = useCallback(async () => {
    if (!NATIVE_ACTIVE) return false;
    return CycleSenseNative.hasUsageStatsPermission();
  }, []);

  return {
    status,
    sessions,
    settings,
    chargers,
    chargerGreeting,
    dismissChargerGreeting,
    renameCharger,
    forgetCharger,
    capabilities,
    samples,
    chargeEstimateSamples: liveChargeSamples.length > 0 ? liveChargeSamples : samples,
    refreshSamples,
    screenDaily,
    screenDailyLive,
    baseline,
    batteryHealth,
    timeToFullMinutes,
    timeToFullSource: timeToFullEstimate?.source ?? null,
    ready,
    openSession,
    updateSessionDiary,
    updateSettings,
    reloadSettings,
    exportCsv,
    refresh,
    reloadSessions,
    formatDuration,
    nativeBridgeActive: NATIVE_ACTIVE,
    requestUsageStats,
    hasUsageStatsPermission,
  };
}