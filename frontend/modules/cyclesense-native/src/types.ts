export type NativeBatteryTelemetry = {
  available: boolean;
  timestamp: number;
  level: number; // 0..1, -1 when unavailable
  levelPercent: number; // 0..100, -1 when unavailable
  statusCode: number;
  statusLabel: "charging" | "discharging" | "full" | "not_charging" | "unknown";
  pluggedCode: number;
  pluggedLabel: "ac" | "usb" | "wireless" | "unplugged" | "unknown";
  voltageMv: number;
  temperatureCelsius: number | null;
  technology: string | null;
  healthCode: number;
  healthLabel: "good" | "overheat" | "dead" | "over_voltage" | "failure" | "cold" | "unknown";
  currentNowMicroA: number;
  currentAverageMicroA: number;
  chargeCounterMicroAh: number;
  chargeTimeRemainingMs: number;
  energyCounterNanoWh: number;
  isCharging: boolean;
  cycleCount: number; // -1 when unavailable (needs API 34+ and device support)
  designCapacityMah: number; // -1 when unavailable (PowerProfile reflection can fail on some OEMs)
};

export type NativeUsageStat = {
  packageName: string;
  label: string;
  totalTimeForegroundMs: number;
  firstTimeStampMs: number;
  lastTimeStampMs: number;
  lastTimeUsedMs: number;
};

export type NativeUsageEvent = {
  packageName: string;
  foregroundMs: number;
  label: string;
};

export type NativeNetworkUsageStat = {
  packageName: string;
  label: string;
  totalBytes: number;
};

export type TelemetryEvent = { payload: string };

export type ScreenEvent = { payload: string };

export type ScreenChange = {
  screenOn: boolean;
  timestamp: number;
};
