import type { EventSubscription } from "expo-modules-core";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

import type { NativeBatteryTelemetry, NativeNetworkUsageStat, NativeUsageEvent, NativeUsageStat, ScreenChange, ScreenEvent, TelemetryEvent } from "./types";

export type { NativeBatteryTelemetry, NativeNetworkUsageStat, NativeUsageEvent, NativeUsageStat, ScreenChange, ScreenEvent, TelemetryEvent };

type NativeSurface = {
  platform: string;
  isSupported: boolean;
  minIntervalMinutes: number;
  getBatteryTelemetry(): Promise<NativeBatteryTelemetry>;
  startBackgroundSampling(intervalMinutes: number): Promise<boolean>;
  stopBackgroundSampling(): Promise<boolean>;
  isBackgroundSamplingActive(): Promise<boolean>;
  getSamples(limit: number): Promise<NativeBatteryTelemetry[]>;
  clearSamples(): Promise<boolean>;
  hasUsageStatsPermission(): Promise<boolean>;
  openUsageStatsSettings(): Promise<boolean>;
  getUsageStats(dayCount: number): Promise<NativeUsageStat[]>;
  getUsageEvents(startMs: number, endMs: number): Promise<NativeUsageEvent[]>;
  getNetworkUsage(startMs: number, endMs: number): Promise<NativeNetworkUsageStat[]>;
  startSessionForeground(mode: string, startLevel: number): Promise<boolean>;
  stopSessionForeground(): Promise<boolean>;
  isScreenOn(): Promise<boolean>;
  setSoundCuesEnabled(enabled: boolean): Promise<boolean>;
   setDynamicIconState(charging: boolean): Promise<boolean>;
  updateWidget(levelPercent: number, ratePerHour: number, mode: string | null, chargerName: string | null): Promise<boolean>;
  addListener(event: string, listener: (event: TelemetryEvent | ScreenEvent) => void): EventSubscription;
  removeListener?(event: string, listener: (event: TelemetryEvent | ScreenEvent) => void): void;
};

const nativeModule = requireOptionalNativeModule<NativeSurface>("CycleSenseNative");

export const CycleSenseNative = {
  isNative: nativeModule !== null,
  platform: nativeModule?.platform ?? Platform.OS,
  minIntervalMinutes: nativeModule?.minIntervalMinutes ?? 15,

  async getBatteryTelemetry(): Promise<NativeBatteryTelemetry> {
    if (nativeModule) return nativeModule.getBatteryTelemetry();
    return mockTelemetry();
  },

  async startBackgroundSampling(intervalMinutes: number = 15): Promise<boolean> {
    return nativeModule ? nativeModule.startBackgroundSampling(intervalMinutes) : false;
  },

  async stopBackgroundSampling(): Promise<boolean> {
    return nativeModule ? nativeModule.stopBackgroundSampling() : false;
  },

  async isBackgroundSamplingActive(): Promise<boolean> {
    return nativeModule ? nativeModule.isBackgroundSamplingActive() : false;
  },

  async getSamples(limit: number = 200): Promise<NativeBatteryTelemetry[]> {
    return nativeModule ? nativeModule.getSamples(limit) : [];
  },

  async clearSamples(): Promise<boolean> {
    return nativeModule ? nativeModule.clearSamples() : true;
  },

  async hasUsageStatsPermission(): Promise<boolean> {
    return nativeModule ? nativeModule.hasUsageStatsPermission() : false;
  },

  async openUsageStatsSettings(): Promise<boolean> {
    return nativeModule ? nativeModule.openUsageStatsSettings() : false;
  },

  async getUsageStats(dayCount: number = 1): Promise<NativeUsageStat[]> {
    return nativeModule ? nativeModule.getUsageStats(dayCount) : [];
  },

  async getUsageEvents(startMs: number, endMs: number): Promise<NativeUsageEvent[]> {
    return nativeModule ? nativeModule.getUsageEvents(startMs, endMs) : [];
  },

  async getNetworkUsage(startMs: number, endMs: number): Promise<NativeNetworkUsageStat[]> {
    return nativeModule ? nativeModule.getNetworkUsage(startMs, endMs) : [];
  },

  async startSessionForeground(mode: "charge" | "discharge", startLevel: number): Promise<boolean> {
    return nativeModule ? nativeModule.startSessionForeground(mode, startLevel) : false;
  },

  async stopSessionForeground(): Promise<boolean> {
    return nativeModule ? nativeModule.stopSessionForeground() : false;
  },

  async isScreenOn(): Promise<boolean> {
    return nativeModule ? nativeModule.isScreenOn() : true;
  },

  async setSoundCuesEnabled(enabled: boolean): Promise<boolean> {
    return nativeModule ? nativeModule.setSoundCuesEnabled(enabled) : false;
  },

  async setDynamicIconState(charging: boolean): Promise<boolean> {
    return nativeModule ? nativeModule.setDynamicIconState(charging) : false;
  },

  async updateWidget(levelPercent: number, ratePerHour: number, mode: string | null, chargerName: string | null): Promise<boolean> {
    return nativeModule ? nativeModule.updateWidget(levelPercent, ratePerHour, mode, chargerName) : false;
  },

  addTelemetryListener(listener: (telemetry: NativeBatteryTelemetry) => void): EventSubscription {
    if (!nativeModule) return { remove() {} } as EventSubscription;
    return nativeModule.addListener("onTelemetryChange", (event) => {
      try {
        listener(JSON.parse((event as TelemetryEvent).payload) as NativeBatteryTelemetry);
      } catch {
        // ignore malformed payloads
      }
    });
  },

  addScreenChangeListener(listener: (change: ScreenChange) => void): EventSubscription {
    if (!nativeModule) return { remove() {} } as EventSubscription;
    return nativeModule.addListener("onScreenChange", (event) => {
      try {
        listener(JSON.parse((event as ScreenEvent).payload) as ScreenChange);
      } catch {
        // ignore malformed payloads
      }
    });
  },
};

function mockTelemetry(): NativeBatteryTelemetry {
  return {
    available: false,
    timestamp: Date.now(),
    level: -1,
    levelPercent: -1,
    statusCode: 0,
    statusLabel: "unknown",
    pluggedCode: 0,
    pluggedLabel: "unknown",
    voltageMv: -1,
    temperatureCelsius: null,
    technology: null,
    healthCode: 0,
    healthLabel: "unknown",
    currentNowMicroA: 0,
    currentAverageMicroA: 0,
    chargeCounterMicroAh: 0,
    chargeTimeRemainingMs: -1,
    energyCounterNanoWh: 0,
    isCharging: false,
    cycleCount: -1,
    designCapacityMah: -1,
  };
}

export default CycleSenseNative;
