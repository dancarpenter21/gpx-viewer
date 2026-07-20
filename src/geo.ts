import type { GpxPoint, ParsedGpx } from "./gpx";

const EARTH_RADIUS_METERS = 6_371_008.8;

export interface LegMetrics {
  distanceMeters: number;
  bearingDegrees: number;
  direction: string;
  speedMetersPerSecond?: number;
  speedSource?: "recorded" | "calculated";
}

export interface RouteStats {
  pointCount: number;
  distanceMeters: number;
  startTime?: Date;
  endTime?: Date;
  durationSeconds?: number;
  minElevation?: number;
  maxElevation?: number;
  averageSpeedMetersPerSecond?: number;
  maxSpeedMetersPerSecond?: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function distanceBetween(start: GpxPoint, end: GpxPoint): number {
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(end.longitude - start.longitude);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function bearingBetween(start: GpxPoint, end: GpxPoint): number {
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);
  const deltaLon = toRadians(end.longitude - start.longitude);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function compassDirection(bearing: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[Math.round(bearing / 22.5) % 16];
}

export function getLegMetrics(start: GpxPoint, end: GpxPoint): LegMetrics {
  const distanceMeters = distanceBetween(start, end);
  const bearingDegrees = bearingBetween(start, end);
  let speedMetersPerSecond: number | undefined;
  let speedSource: LegMetrics["speedSource"];

  if (start.speed !== undefined && start.speed >= 0) {
    speedMetersPerSecond = start.speed;
    speedSource = "recorded";
  } else if (start.time && end.time) {
    const elapsedSeconds = (end.time.getTime() - start.time.getTime()) / 1000;
    if (elapsedSeconds > 0) {
      speedMetersPerSecond = distanceMeters / elapsedSeconds;
      speedSource = "calculated";
    }
  }

  return {
    distanceMeters,
    bearingDegrees,
    direction: compassDirection(bearingDegrees),
    speedMetersPerSecond,
    speedSource,
  };
}

export function calculateStats(gpx: ParsedGpx): RouteStats {
  const points = gpx.tracks.flatMap((track) => track.segments.flat());
  const elevations = points.flatMap((point) => point.elevation === undefined ? [] : [point.elevation]);
  const legSpeeds: number[] = [];
  let distanceMeters = 0;
  let firstTime: number | undefined;
  let lastTime: number | undefined;

  for (const track of gpx.tracks) {
    for (const segment of track.segments) {
      for (let index = 1; index < segment.length; index += 1) {
        distanceMeters += distanceBetween(segment[index - 1], segment[index]);
        const speed = getLegMetrics(segment[index - 1], segment[index]).speedMetersPerSecond;
        if (speed !== undefined) legSpeeds.push(speed);
      }
      for (const point of segment) {
        if (!point.time) continue;
        const time = point.time.getTime();
        firstTime = firstTime === undefined ? time : Math.min(firstTime, time);
        lastTime = lastTime === undefined ? time : Math.max(lastTime, time);
      }
    }
  }

  const durationSeconds = firstTime !== undefined && lastTime !== undefined && lastTime > firstTime
    ? (lastTime - firstTime) / 1000
    : undefined;

  return {
    pointCount: points.length,
    distanceMeters,
    startTime: firstTime === undefined ? undefined : new Date(firstTime),
    endTime: lastTime === undefined ? undefined : new Date(lastTime),
    durationSeconds,
    minElevation: elevations.length ? Math.min(...elevations) : undefined,
    maxElevation: elevations.length ? Math.max(...elevations) : undefined,
    averageSpeedMetersPerSecond: durationSeconds ? distanceMeters / durationSeconds : undefined,
    maxSpeedMetersPerSecond: legSpeeds.length ? Math.max(...legSpeeds) : undefined,
  };
}
