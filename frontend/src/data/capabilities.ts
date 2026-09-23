import { Capabilities } from "@/src/data/cyclesense";
import type { NativeBatteryTelemetry } from "@/modules/cyclesense-native/src";

/**
 * Inspects a native telemetry snapshot to determine which BatteryManager
 * fields are actually populated on this device. Used at startup to gate
 * features and to power a diagnostics row in Settings.
 * Every device reports level + charging state, so those are not tracked here.
 */
export function detectCapabilities(
  telemetry: NativeBatteryTelemetry | null,
  nativeBridge: boolean,
): Capabilities {
  if (!nativeBridge || !telemetry) {
    return {
      current: false,
      voltage: false,
      temperature: false,
      chargeCounter: false,
      technology: false,
      health: false,
      rawSamples: false,
      screenTracking: false,
      cycleCount: false,
      designCapacity: false,
    };
  }
  return {
    current: telemetry.currentNowMicroA !== 0,
    voltage: telemetry.voltageMv > 0,
    temperature: telemetry.temperatureCelsius != null,
    chargeCounter: telemetry.chargeCounterMicroAh > 0,
    technology: telemetry.technology != null && telemetry.technology.length > 0,
    health: telemetry.healthLabel !== "unknown" && telemetry.healthLabel !== undefined,
    rawSamples: true,
    screenTracking: true,
    cycleCount: telemetry.cycleCount != null && telemetry.cycleCount >= 0,
    designCapacity: telemetry.designCapacityMah != null && telemetry.designCapacityMah > 0,
  };
}

export const NO_CAPABILITIES: Capabilities = {
  current: false,
  voltage: false,
  temperature: false,
  chargeCounter: false,
  technology: false,
  health: false,
  rawSamples: false,
  screenTracking: false,
  cycleCount: false,
  designCapacity: false,
};