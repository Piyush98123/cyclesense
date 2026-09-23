export type BatteryMode = "charging" | "discharging" | "full" | "unknown";

export type BatteryStatus = {
  available: boolean;
  level: number | null;
  mode: BatteryMode;
  lowPowerMode: boolean;
  updatedAt: string | null;
  // Extended native telemetry (Android bridge). Optional on iOS/web.
  temperatureCelsius?: number | null;
  voltageMv?: number | null;
  currentNowMicroA?: number | null;
  currentAverageMicroA?: number | null;
  chargeCounterMicroAh?: number | null;
  technology?: string | null;
  healthLabel?: string | null;
  pluggedLabel?: string | null;
  nativeBridge?: boolean;
  cycleCount?: number | null;
  designCapacityMah?: number | null;
};

export type ChargerCategory = "fast" | "standard" | "slow" | "trickle";

export type CurvePoint = { t: number; level: number };

export type Session = {
  id: string;
  mode: "charge" | "discharge";
  startAt: string;
  endAt: string | null;
  startLevel: number;
  endLevel: number | null;
  durationMinutes: number | null;
  rate: number | null;
  confidence: "High" | "Medium" | "Low";
  chargerType: string | null;
  chargerLabel: string | null;
  chargerCategory: ChargerCategory | null;
  chargerId: string | null;
  chargerName: string | null;
  startVoltageMv: number | null;
  peakCurrentMicroA: number | null;
  screenOnMinutes: number | null;
  screenOffMinutes: number | null;
  startChargeCounterMicroAh: number | null;
  endChargeCounterMicroAh: number | null;
  mAhDelta: number | null;
  topApps: TopApp[] | null;
  baselineDeviation: number | null; // % deviation from 7-day baseline, only for discharge sessions
  note: string | null;
  tags: string[] | null;
  curve: CurvePoint[] | null; // raw level samples captured during the session, for comparison overlays
};

export type TopApp = {
  packageName: string;
  label: string;
  minutes: number;
};

export type PowerState = "IDLE" | "CHARGING" | "DISCHARGING";

export type PersistedPowerState = {
  state: PowerState;
  atIso: string;
  levelPercent: number | null;
};

export type ScreenDaily = {
  date: string; // YYYY-MM-DD in local time
  totalOnMinutes: number;
  longestOnMinutes: number;
};

export type Capabilities = {
  current: boolean;
  voltage: boolean;
  temperature: boolean;
  chargeCounter: boolean;
  technology: boolean;
  health: boolean;
  rawSamples: boolean;
  screenTracking: boolean;
  cycleCount: boolean;
  designCapacity: boolean;
};

export const capabilityLabels: Record<keyof Capabilities, string> = {
  current: "Current (mA)",
  voltage: "Voltage",
  temperature: "Temperature",
  chargeCounter: "Charge counter",
  technology: "Technology",
  health: "Battery health",
  rawSamples: "Raw samples",
  screenTracking: "Screen tracking",
  cycleCount: "Cycle count",
  designCapacity: "Design capacity",
};

export type Charger = {
  id: string;
  name: string;
  category: ChargerCategory;
  plugLabel: string; // "ac" | "usb" | "wireless" | "unknown"
  avgPeakMa: number;
  avgVoltageMv: number | null;
  avgDurationMinutes: number | null;
  uses: number;
  createdAt: string;
  lastUsedAt: string;
};

export type DashboardCardId = "status" | "telemetry" | "curve";

export const dashboardCardLabels: Record<DashboardCardId, string> = {
  status: "Live status",
  telemetry: "Quick telemetry",
  curve: "Live curve",
};

export type CycleSettings = {
  soundCues: boolean;
  chargeAlert: number;
  dischargeAlert: number;
  backgroundSampling: boolean;
  usageStatsEnabled: boolean;
  dashboardOrder: DashboardCardId[];
};

export const defaultSettings: CycleSettings = {
  soundCues: true,
  chargeAlert: 90,
  dischargeAlert: 20,
  backgroundSampling: false,
  usageStatsEnabled: false,
  dashboardOrder: ["status", "telemetry", "curve"],
};

/** Swaps a card with its neighbor in the given direction. Pure — easy to unit test. */
export function moveDashboardCard(order: DashboardCardId[], id: DashboardCardId, direction: -1 | 1): DashboardCardId[] {
  const index = order.indexOf(id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const SESSION_STORAGE_KEY = "cyclesense:sessions";
export const SETTINGS_STORAGE_KEY = "cyclesense:settings";
export const CHARGER_STORAGE_KEY = "cyclesense:chargers";
export const POWER_STATE_STORAGE_KEY = "cyclesense:power-state";
export const SCREEN_DAILY_STORAGE_KEY = "cyclesense:screen-daily";
// Retention cap for on-device session history. Raised from the original 5
// specifically to make the daily/5-day digest and trend comparison
// meaningful: each charge+discharge pair consumes 2 slots, so 5 covered
// well under a day of real history. 40 comfortably covers a trailing
// ~20-day window (roughly 2 sessions/day) - enough for a full 5-day-vs-
// previous-5-day trend with real headroom, at negligible AsyncStorage cost.
export const SESSION_HISTORY_LIMIT = 40;

export function powerStateFromMode(mode: BatteryMode): PowerState {
  if (mode === "charging" || mode === "full") return "CHARGING";
  if (mode === "discharging") return "DISCHARGING";
  return "IDLE";
}

export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDuration(minutes: number | null) {
  if (minutes === null) return "Open session";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatClock(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function modeLabel(mode: BatteryMode) {
  if (mode === "charging") return "Charging";
  if (mode === "discharging") return "Discharging";
  if (mode === "full") return "Full";
  return "Capability check";
}

/**
 * Classify a charging session as fast / standard / slow / trickle based on
 * the observed rate (%/hr) and, when available, the peak charging current in
 * microamps. Only meaningful for charge sessions; returns nulls otherwise.
 */
export function classifyCharger(input: {
  mode: "charge" | "discharge";
  rate: number | null;
  peakCurrentMicroA: number | null;
  pluggedLabel: string | null;
}): { label: string | null; category: ChargerCategory | null } {
  if (input.mode !== "charge" || input.rate === null || input.rate <= 0) {
    return { label: null, category: null };
  }
  let category: ChargerCategory;
  const currentMa = input.peakCurrentMicroA != null ? Math.abs(input.peakCurrentMicroA) / 1000 : null;
  // Rate wins when we have it; current is a tiebreaker for edge cases.
  if (input.rate >= 90 || (currentMa != null && currentMa >= 2500)) category = "fast";
  else if (input.rate >= 45 || (currentMa != null && currentMa >= 1200)) category = "standard";
  else if (input.rate >= 15) category = "slow";
  else category = "trickle";
  const plug = input.pluggedLabel && input.pluggedLabel !== "unknown" && input.pluggedLabel !== "unplugged" ? capitalize(input.pluggedLabel) : null;
  const base = chargerCategoryLabel(category);
  return { label: plug ? `${plug} · ${base}` : base, category };
}

/**
 * Resamples a session's raw curve onto `points` evenly-spaced steps across
 * 0-100% of its own duration, using linear interpolation. Two sessions have
 * different real durations and different raw sample counts, so this is what
 * lets them be plotted on one shared x-axis for a fair overlay comparison.
 * Falls back to a straight line between start/end when there's no captured
 * curve (older sessions recorded before this feature existed).
 */
export function normalizeCurve(session: Session, points: number = 20): number[] {
  const raw = session.curve;
  if (!raw || raw.length < 2) {
    const start = session.startLevel;
    const end = session.endLevel ?? session.startLevel;
    return Array.from({ length: points }, (_, i) => start + ((end - start) * i) / (points - 1));
  }
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  const t0 = sorted[0].t;
  const t1 = sorted[sorted.length - 1].t;
  const span = Math.max(1, t1 - t0);
  return Array.from({ length: points }, (_, i) => {
    const targetT = t0 + (span * i) / (points - 1);
    let j = 0;
    while (j < sorted.length - 2 && sorted[j + 1].t < targetT) j++;
    const a = sorted[j];
    const b = sorted[j + 1] ?? a;
    const ratio = b.t === a.t ? 0 : (targetT - a.t) / (b.t - a.t);
    return a.level + (b.level - a.level) * ratio;
  });
}

export function chargerCategoryLabel(category: ChargerCategory): string {
  switch (category) {
    case "fast": return "Fast charger";
    case "standard": return "Standard charger";
    case "slow": return "Slow charger";
    case "trickle": return "Trickle";
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}