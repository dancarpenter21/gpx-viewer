import { describe, expect, it } from "vitest";
import sampleGpx from "../sample.gpx?raw";
import { calculateStats, compassDirection, getLegMetrics } from "./geo";
import { parseGpx, type GpxPoint } from "./gpx";

describe("route calculations", () => {
  it("calculates useful statistics for the sample route", () => {
    const stats = calculateStats(parseGpx(sampleGpx));

    expect(stats.pointCount).toBe(817);
    expect(stats.distanceMeters).toBeGreaterThan(3_000);
    expect(stats.distanceMeters).toBeLessThan(5_000);
    expect(stats.durationSeconds).toBeCloseTo(838.984, 3);
    expect(stats.startTime?.toISOString()).toBe("2026-07-20T13:10:36.349Z");
    expect(stats.endTime?.toISOString()).toBe("2026-07-20T13:24:35.333Z");
    expect(stats.minElevation).toBeLessThan(stats.maxElevation!);
    expect(stats.averageSpeedMetersPerSecond).toBeGreaterThan(0);
    expect(stats.maxSpeedMetersPerSecond).toBeCloseTo(8.583895, 6);
  });

  it("prefers recorded speed for a leg", () => {
    const start: GpxPoint = { latitude: 43, longitude: -75, speed: 8.5 };
    const end: GpxPoint = { latitude: 43.001, longitude: -75, time: new Date(10_000) };
    const leg = getLegMetrics(start, end);

    expect(leg.speedMetersPerSecond).toBe(8.5);
    expect(leg.speedSource).toBe("recorded");
  });

  it("calculates speed when recorded speed is absent", () => {
    const start: GpxPoint = { latitude: 0, longitude: 0, time: new Date(0) };
    const end: GpxPoint = { latitude: 0, longitude: 0.001, time: new Date(10_000) };
    const leg = getLegMetrics(start, end);

    expect(leg.speedSource).toBe("calculated");
    expect(leg.speedMetersPerSecond).toBeCloseTo(leg.distanceMeters / 10, 8);
    expect(leg.direction).toBe("E");
    expect(leg.bearingDegrees).toBeCloseTo(90, 5);
  });

  it("reports unavailable speed and formats 16 compass directions", () => {
    const leg = getLegMetrics({ latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 });
    expect(leg.speedMetersPerSecond).toBeUndefined();
    expect(compassDirection(0)).toBe("N");
    expect(compassDirection(225)).toBe("SW");
    expect(compassDirection(359)).toBe("N");
  });

  it("does not include distance between separate segments", () => {
    const route = parseGpx(`<gpx version="1.1">
      <trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.001"/></trkseg>
      <trkseg><trkpt lat="40" lon="40"/><trkpt lat="40" lon="40.001"/></trkseg></trk>
    </gpx>`);
    expect(calculateStats(route).distanceMeters).toBeLessThan(250);
  });
});
