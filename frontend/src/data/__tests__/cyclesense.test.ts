import { classifyCharger, formatDuration, moveDashboardCard, normalizeCurve } from "@/src/data/cyclesense";
import { mkSession } from "./fixtures";

describe("moveDashboardCard", () => {
  const order: ("status" | "telemetry" | "curve")[] = ["status", "telemetry", "curve"];

  it("swaps a card with its neighbor when moved down", () => {
    expect(moveDashboardCard(order, "status", 1)).toEqual(["telemetry", "status", "curve"]);
  });

  it("swaps a card with its neighbor when moved up", () => {
    expect(moveDashboardCard(order, "curve", -1)).toEqual(["status", "curve", "telemetry"]);
  });

  it("does nothing when already at the boundary in that direction", () => {
    expect(moveDashboardCard(order, "status", -1)).toEqual(order);
    expect(moveDashboardCard(order, "curve", 1)).toEqual(order);
  });

  it("is immutable - does not mutate the input array", () => {
    const original = [...order];
    moveDashboardCard(order, "status", 1);
    expect(order).toEqual(original);
  });
});

describe("normalizeCurve", () => {
  it("resamples a real curve onto evenly-spaced points via linear interpolation", () => {
    const session = mkSession({
      startLevel: 50,
      endLevel: 90,
      curve: [
        { t: 0, level: 50 },
        { t: 1000, level: 70 },
        { t: 2000, level: 90 },
      ],
    });
    const points = normalizeCurve(session, 5);
    expect(points.length).toBe(5);
    expect(points[0]).toBe(50);
    expect(points[points.length - 1]).toBe(90);
    // Midpoint (t=1000) should land exactly on the known 70 sample.
    expect(points[2]).toBe(70);
  });

  it("falls back to a straight line between start/end when there's no captured curve", () => {
    const session = mkSession({ startLevel: 40, endLevel: 80, curve: null });
    const points = normalizeCurve(session, 3);
    expect(points).toEqual([40, 60, 80]);
  });

  it("falls back to a straight line when the curve has fewer than 2 points", () => {
    const session = mkSession({ startLevel: 40, endLevel: 80, curve: [{ t: 0, level: 40 }] });
    expect(normalizeCurve(session, 3)).toEqual([40, 60, 80]);
  });
});

describe("classifyCharger", () => {
  it("returns nulls for a discharge session", () => {
    expect(classifyCharger({ mode: "discharge", rate: 50, peakCurrentMicroA: 2000000, pluggedLabel: "ac" })).toEqual({ label: null, category: null });
  });

  it("classifies a high rate as fast", () => {
    const { category } = classifyCharger({ mode: "charge", rate: 95, peakCurrentMicroA: null, pluggedLabel: "ac" });
    expect(category).toBe("fast");
  });

  it("classifies a low but positive rate as trickle", () => {
    const { category } = classifyCharger({ mode: "charge", rate: 10, peakCurrentMicroA: null, pluggedLabel: "usb" });
    expect(category).toBe("trickle");
  });

  it("uses peak current as a tiebreaker when rate alone would say standard", () => {
    const { category } = classifyCharger({ mode: "charge", rate: 50, peakCurrentMicroA: 2600000, pluggedLabel: "ac" });
    expect(category).toBe("fast");
  });

  it("returns nulls when rate is missing or non-positive", () => {
    expect(classifyCharger({ mode: "charge", rate: null, peakCurrentMicroA: 2000000, pluggedLabel: "ac" })).toEqual({ label: null, category: null });
    expect(classifyCharger({ mode: "charge", rate: 0, peakCurrentMicroA: 2000000, pluggedLabel: "ac" })).toEqual({ label: null, category: null });
  });
});

describe("formatDuration", () => {
  it("formats null as an open session", () => {
    expect(formatDuration(null)).toBe("Open session");
  });

  it("formats sub-hour durations as minutes only", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("formats durations over an hour as hours and minutes", () => {
    expect(formatDuration(125)).toBe("2h 5m");
  });
});
