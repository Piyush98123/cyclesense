import { Charger, Session } from "@/src/data/cyclesense";
import type { NativeBatteryTelemetry } from "@/modules/cyclesense-native/src";

/**
 * Builds a fully-valid Session with sensible defaults, overridable per test.
 * Keeps test cases focused on the one or two fields that actually matter for
 * what's being asserted, instead of every test hand-rolling all 25 fields.
 */
export function mkSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `session-${Math.random().toString(36).slice(2)}`,
    mode: "discharge",
    startAt: new Date().toISOString(),
    endAt: new Date().toISOString(),
    startLevel: 90,
    endLevel: 70,
    durationMinutes: 60,
    rate: 20,
    confidence: "High",
    chargerType: null,
    chargerLabel: null,
    chargerCategory: null,
    chargerId: null,
    chargerName: null,
    startVoltageMv: null,
    peakCurrentMicroA: null,
    screenOnMinutes: null,
    screenOffMinutes: null,
    startChargeCounterMicroAh: null,
    endChargeCounterMicroAh: null,
    mAhDelta: null,
    topApps: null,
    baselineDeviation: null,
    note: null,
    tags: null,
    curve: null,
    ...overrides,
  };
}

export function mkCharger(overrides: Partial<Charger> = {}): Charger {
  const now = new Date().toISOString();
  return {
    id: `charger-${Math.random().toString(36).slice(2)}`,
    name: "Test Charger",
    category: "standard",
    plugLabel: "ac",
    avgPeakMa: 1500,
    avgVoltageMv: 5000,
    avgDurationMinutes: 60,
    uses: 1,
    createdAt: now,
    lastUsedAt: now,
    ...overrides,
  };
}

/** `daysAgo` sessions land at the same time-of-day as "now" minus N days. */
export function daysAgoIso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Minimal raw telemetry sample - the projection/curve logic under test only
 * ever reads `timestamp` and `levelPercent`, but the real type has many more
 * fields, so this fills sensible defaults for the rest.
 */
export function mkSample(timestamp: number, levelPercent: number): NativeBatteryTelemetry {
  return {
    available: true,
    timestamp,
    level: levelPercent / 100,
    levelPercent,
    statusCode: 2,
    statusLabel: "charging",
    pluggedCode: 1,
    pluggedLabel: "ac",
    voltageMv: 4000,
    temperatureCelsius: 28,
    technology: "Li-ion",
    healthCode: 2,
    healthLabel: "good",
    currentNowMicroA: 1000000,
    currentAverageMicroA: 1000000,
    chargeCounterMicroAh: 2000000,
    energyCounterNanoWh: 0,
    isCharging: true,
    cycleCount: -1,
    designCapacityMah: -1,
  };
}
