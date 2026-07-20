export type UnitSystem = "metric" | "imperial";

const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const MILES_PER_HOUR_PER_METER_PER_SECOND = 2.2369362921;

export function unitSystemForLocales(locales: readonly string[]): UnitSystem {
  for (const locale of locales) {
    try {
      const region = new Intl.Locale(locale).maximize().region;
      if (region) return IMPERIAL_REGIONS.has(region) ? "imperial" : "metric";
    } catch {
      // Ignore malformed browser locale values and try the next one.
    }
  }
  return "metric";
}

export function formatDistance(meters: number, system: UnitSystem): string {
  if (system === "imperial") {
    const miles = meters / METERS_PER_MILE;
    return miles >= 0.1 ? `${miles.toFixed(2)} mi` : `${Math.round(meters * FEET_PER_METER)} ft`;
  }
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function formatSpeed(metersPerSecond: number | undefined, system: UnitSystem): string {
  if (metersPerSecond === undefined) return "--";
  return system === "imperial"
    ? `${(metersPerSecond * MILES_PER_HOUR_PER_METER_PER_SECOND).toFixed(1)} mph`
    : `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

export function formatElevation(min: number | undefined, max: number | undefined, system: UnitSystem): string {
  if (min === undefined || max === undefined) return "--";
  const factor = system === "imperial" ? FEET_PER_METER : 1;
  const suffix = system === "imperial" ? "ft" : "m";
  return `${Math.round(min * factor)}–${Math.round(max * factor)} ${suffix}`;
}
