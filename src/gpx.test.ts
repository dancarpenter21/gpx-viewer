import { describe, expect, it } from "vitest";
import sampleGpx from "../sample.gpx?raw";
import { allPoints, parseGpx } from "./gpx";

describe("parseGpx", () => {
  it("parses the provided route and its extension data", () => {
    const route = parseGpx(sampleGpx, "sample.gpx");
    const points = allPoints(route);

    expect(route.name).toBe("Speed Compass Route");
    expect(route.tracks).toHaveLength(1);
    expect(route.tracks[0].segments).toHaveLength(1);
    expect(points).toHaveLength(817);
    expect(points[0]).toMatchObject({
      latitude: 43.2218744,
      longitude: -75.4485416,
      elevation: 107.75424174374103,
      speed: 0.11281721,
    });
    expect(points[0].time?.toISOString()).toBe("2026-07-20T13:10:36.349Z");
    expect(points.at(-1)).toMatchObject({
      latitude: 43.2197136,
      longitude: -75.4099414,
      elevation: 113.19999694824219,
      speed: 0.6228488,
    });
    expect(points.at(-1)?.time?.toISOString()).toBe("2026-07-20T13:24:35.333Z");
  });

  it("preserves separate tracks and segment boundaries", () => {
    const route = parseGpx(`<?xml version="1.0"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
        <trk><name>Split route</name>
          <trkseg><trkpt lat="40" lon="-75"/><trkpt lat="40.1" lon="-75.1"/></trkseg>
          <trkseg><trkpt lat="41" lon="-76"/><trkpt lat="41.1" lon="-76.1"/></trkseg>
        </trk>
      </gpx>`);

    expect(route.tracks[0].segments).toHaveLength(2);
    expect(route.tracks[0].segments.map((segment) => segment.length)).toEqual([2, 2]);
  });

  it("rejects malformed and empty GPX documents", () => {
    expect(() => parseGpx("<gpx><trk>")) .toThrow("not valid XML");
    expect(() => parseGpx("<not-gpx />")).toThrow("does not contain a GPX");
    expect(() => parseGpx("<gpx version='1.1'><trk><trkseg /></trk></gpx>"))
      .toThrow("No valid track points");
  });
});
