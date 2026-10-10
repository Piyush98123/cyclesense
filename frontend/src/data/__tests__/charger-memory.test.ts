import {
  createChargerFromFingerprint,
  findMatchingCharger,
  guessChargerAtStart,
  mergeChargerFingerprint,
  suggestChargerName,
} from "@/src/data/charger-memory";
import { mkCharger } from "./fixtures";

describe("suggestChargerName", () => {
  it("names a fast AC charger with no plug prefix", () => {
    expect(suggestChargerName({ category: "fast", plugLabel: "ac", peakMa: 2500, voltageMv: 5000, durationMinutes: 30 }, [])).toBe("Fast charger");
  });

  it("prefixes non-AC plug types", () => {
    expect(suggestChargerName({ category: "standard", plugLabel: "usb", peakMa: 1000, voltageMv: 5000, durationMinutes: 60 }, [])).toBe("USB Standard charger");
    expect(suggestChargerName({ category: "standard", plugLabel: "wireless", peakMa: 800, voltageMv: 5000, durationMinutes: 90 }, [])).toBe("Wireless Standard charger");
  });

  it("numbers subsequent chargers with the same name", () => {
    const existing = [mkCharger({ name: "Fast charger" })];
    expect(suggestChargerName({ category: "fast", plugLabel: "ac", peakMa: 2500, voltageMv: 5000, durationMinutes: 30 }, existing)).toBe("Fast charger #2");
  });
});

describe("findMatchingCharger", () => {
  const known = mkCharger({ category: "standard", plugLabel: "ac", avgPeakMa: 1500, avgVoltageMv: 5000, uses: 3 });

  it("matches a fingerprint within peak-current and voltage tolerance", () => {
    const match = findMatchingCharger({ category: "standard", plugLabel: "ac", peakMa: 1520, voltageMv: 5050, durationMinutes: 60 }, [known]);
    expect(match).toBe(known);
  });

  it("does not match a different category even with identical current", () => {
    const match = findMatchingCharger({ category: "fast", plugLabel: "ac", peakMa: 1500, voltageMv: 5000, durationMinutes: 60 }, [known]);
    expect(match).toBeNull();
  });

  it("does not match when peak current is far outside tolerance", () => {
    const match = findMatchingCharger({ category: "standard", plugLabel: "ac", peakMa: 3000, voltageMv: 5000, durationMinutes: 60 }, [known]);
    expect(match).toBeNull();
  });

  it("does not match when voltage differs by more than 250mV, even with matching current", () => {
    const match = findMatchingCharger({ category: "standard", plugLabel: "ac", peakMa: 1500, voltageMv: 5400, durationMinutes: 60 }, [known]);
    expect(match).toBeNull();
  });

  it("allows a match when one side's plug type is unknown", () => {
    const match = findMatchingCharger({ category: "standard", plugLabel: "unknown", peakMa: 1500, voltageMv: 5000, durationMinutes: 60 }, [known]);
    expect(match).toBe(known);
  });
});

describe("guessChargerAtStart", () => {
  it("returns null for an unplugged or missing plug label", () => {
    expect(guessChargerAtStart(null, 5000, [mkCharger()])).toBeNull();
    expect(guessChargerAtStart("unplugged", 5000, [mkCharger()])).toBeNull();
  });

  it("returns the only candidate of a matching plug type without needing voltage", () => {
    const only = mkCharger({ plugLabel: "ac" });
    expect(guessChargerAtStart("ac", null, [only])).toBe(only);
  });

  it("tie-breaks multiple candidates by closest voltage", () => {
    const chargerA = mkCharger({ plugLabel: "ac", avgVoltageMv: 5000 });
    const chargerB = mkCharger({ plugLabel: "ac", avgVoltageMv: 9000 });
    expect(guessChargerAtStart("ac", 8800, [chargerA, chargerB])).toBe(chargerB);
  });

  it("tie-breaks by usage count when voltage is unknown", () => {
    const rarelyUsed = mkCharger({ plugLabel: "ac", uses: 1 });
    const oftenUsed = mkCharger({ plugLabel: "ac", uses: 20 });
    expect(guessChargerAtStart("ac", null, [rarelyUsed, oftenUsed])).toBe(oftenUsed);
  });
});

describe("mergeChargerFingerprint", () => {
  it("computes a weighted average of peak current and increments uses", () => {
    const charger = mkCharger({ avgPeakMa: 1500, uses: 1, avgVoltageMv: null, avgDurationMinutes: null });
    const merged = mergeChargerFingerprint(charger, { category: "standard", plugLabel: "ac", peakMa: 1700, voltageMv: 5000, durationMinutes: 45 });
    expect(merged.avgPeakMa).toBe(1600); // (1500*1 + 1700) / 2
    expect(merged.uses).toBe(2);
    expect(merged.avgVoltageMv).toBe(5000); // first real voltage reading
    expect(merged.avgDurationMinutes).toBe(45);
  });

  it("keeps the existing plug label when the new fingerprint's is unknown", () => {
    const charger = mkCharger({ plugLabel: "ac" });
    const merged = mergeChargerFingerprint(charger, { category: "standard", plugLabel: "unknown", peakMa: 1500, voltageMv: null, durationMinutes: null });
    expect(merged.plugLabel).toBe("ac");
  });

  it("is immutable - does not mutate the original charger", () => {
    const charger = mkCharger({ uses: 1 });
    mergeChargerFingerprint(charger, { category: "standard", plugLabel: "ac", peakMa: 1500, voltageMv: 5000, durationMinutes: 60 });
    expect(charger.uses).toBe(1);
  });
});

describe("createChargerFromFingerprint", () => {
  it("creates a new charger with uses=1 and rounded fields", () => {
    const created = createChargerFromFingerprint({ category: "fast", plugLabel: "ac", peakMa: 2503.7, voltageMv: 5001.2, durationMinutes: 30 }, "My Fast Charger");
    expect(created.name).toBe("My Fast Charger");
    expect(created.uses).toBe(1);
    expect(created.avgPeakMa).toBe(2504);
    expect(created.avgVoltageMv).toBe(5001);
  });
});
