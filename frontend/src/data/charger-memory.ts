import { Charger, ChargerCategory } from "@/src/data/cyclesense";

export type ChargerFingerprint = {
  category: ChargerCategory;
  plugLabel: string;
  peakMa: number;
  voltageMv: number | null;
};

const PLUG_ORDER = ["ac", "usb", "wireless", "unknown"] as const;

/**
 * Suggest a friendly default name for a newly-detected charger. Examples:
 *   "Fast charger", "Fast charger #2", "USB slow charger #3".
 * Users can rename to whatever they want ("Desk fast charger") from Timeline.
 */
export function suggestChargerName(fingerprint: ChargerFingerprint, existing: Charger[]): string {
  const category = capitalize(fingerprint.category === "trickle" ? "trickle" : `${fingerprint.category} charger`);
  const plugPrefix = fingerprint.plugLabel === "ac" ? "" : fingerprint.plugLabel === "usb" ? "USB " : fingerprint.plugLabel === "wireless" ? "Wireless " : "";
  const base = `${plugPrefix}${category}`.trim();
  const sameName = existing.filter((c) => c.name === base || c.name.startsWith(`${base} #`));
  if (sameName.length === 0) return base;
  const nextIndex = sameName.length + 1;
  return `${base} #${nextIndex}`;
}

/**
 * Find the best-matching known charger for a given fingerprint. Returns null
 * when nothing is similar enough. Scoring:
 *   - plug type must match (or one side is "unknown")
 *   - category must match
 *   - peak current within 30 percent of the stored average
 *   - voltage within 200 mV when both sides have it
 */
export function findMatchingCharger(fingerprint: ChargerFingerprint, chargers: Charger[]): Charger | null {
  const candidates = chargers
    .map((charger) => ({ charger, score: matchScore(fingerprint, charger) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return candidates[0]?.charger ?? null;
}

/**
 * Predict which known charger is most likely at *session start* using only
 * the plug type and initial voltage - peak current is unknown yet. Returns
 * null when there is not enough signal for a confident greeting.
 */
export function guessChargerAtStart(
  plugLabel: string | null,
  startVoltageMv: number | null,
  chargers: Charger[],
): Charger | null {
  if (!plugLabel || plugLabel === "unplugged") return null;
  const plugPool = chargers.filter((c) => c.plugLabel === plugLabel || c.plugLabel === "unknown");
  if (plugPool.length === 0) return null;
  if (plugPool.length === 1) return plugPool[0];
  if (startVoltageMv == null) {
    // Tie-break by most frequently used charger of this plug type
    return [...plugPool].sort((a, b) => b.uses - a.uses)[0];
  }
  const scored = plugPool
    .map((c) => ({ c, delta: c.avgVoltageMv == null ? 500 : Math.abs(c.avgVoltageMv - startVoltageMv) }))
    .sort((a, b) => a.delta - b.delta);
  return scored[0].c;
}

/**
 * Update a matched charger with the newly observed fingerprint - rolling
 * average of peak current and voltage, incremented usage count, refreshed
 * timestamp. Immutable: returns a new Charger.
 */
export function mergeChargerFingerprint(charger: Charger, fingerprint: ChargerFingerprint): Charger {
  const nextUses = charger.uses + 1;
  const nextPeak = weightedAverage(charger.avgPeakMa, charger.uses, fingerprint.peakMa);
  const nextVoltage =
    fingerprint.voltageMv == null
      ? charger.avgVoltageMv
      : charger.avgVoltageMv == null
      ? fingerprint.voltageMv
      : weightedAverage(charger.avgVoltageMv, charger.uses, fingerprint.voltageMv);
  return {
    ...charger,
    uses: nextUses,
    avgPeakMa: round(nextPeak),
    avgVoltageMv: nextVoltage == null ? null : round(nextVoltage),
    lastUsedAt: new Date().toISOString(),
    // Category can drift if user swaps a cable head - keep the most recent one
    category: fingerprint.category,
    plugLabel: fingerprint.plugLabel === "unknown" ? charger.plugLabel : fingerprint.plugLabel,
  };
}

export function createChargerFromFingerprint(fingerprint: ChargerFingerprint, name: string): Charger {
  const now = new Date().toISOString();
  return {
    id: `charger-${Date.now()}`,
    name,
    category: fingerprint.category,
    plugLabel: fingerprint.plugLabel,
    avgPeakMa: round(fingerprint.peakMa),
    avgVoltageMv: fingerprint.voltageMv == null ? null : round(fingerprint.voltageMv),
    uses: 1,
    createdAt: now,
    lastUsedAt: now,
  };
}

function matchScore(fingerprint: ChargerFingerprint, charger: Charger): number | null {
  if (charger.category !== fingerprint.category) return null;
  if (
    charger.plugLabel !== "unknown" &&
    fingerprint.plugLabel !== "unknown" &&
    charger.plugLabel !== fingerprint.plugLabel
  ) return null;
  const peakTolerance = Math.max(charger.avgPeakMa * 0.3, 300);
  const peakDelta = Math.abs(charger.avgPeakMa - fingerprint.peakMa);
  if (peakDelta > peakTolerance) return null;
  let score = 1 - peakDelta / (peakTolerance || 1);
  if (charger.avgVoltageMv != null && fingerprint.voltageMv != null) {
    const voltageDelta = Math.abs(charger.avgVoltageMv - fingerprint.voltageMv);
    if (voltageDelta > 250) return null;
    score += 1 - voltageDelta / 250;
  }
  // Prefer chargers we know well - modest boost
  score += Math.min(charger.uses, 10) * 0.05;
  return score;
}

function weightedAverage(previous: number, previousCount: number, next: number) {
  if (previousCount <= 0) return next;
  return (previous * previousCount + next) / (previousCount + 1);
}

function round(value: number) {
  return Math.round(value);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Keep exported for tests / debugging visibility
export const _PLUG_ORDER = PLUG_ORDER;
