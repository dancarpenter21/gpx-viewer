import { describe, expect, it } from "vitest";
import { formatDistance, formatElevation, formatSpeed, unitSystemForLocales } from "./units";

describe("unit formatting", () => {
  it("selects a default from the locale's estimated region", () => {
    expect(unitSystemForLocales(["en-US"])).toBe("imperial");
    expect(unitSystemForLocales(["en-GB"])).toBe("metric");
    expect(unitSystemForLocales(["fr-CA"])).toBe("metric");
    expect(unitSystemForLocales(["not_a_locale"])).toBe("metric");
  });

  it("formats metric measurements", () => {
    expect(formatDistance(3_218.688, "metric")).toBe("3.22 km");
    expect(formatDistance(80, "metric")).toBe("80 m");
    expect(formatSpeed(10, "metric")).toBe("36.0 km/h");
    expect(formatElevation(100, 200, "metric")).toBe("100–200 m");
  });

  it("formats imperial measurements", () => {
    expect(formatDistance(3_218.688, "imperial")).toBe("2.00 mi");
    expect(formatDistance(30.48, "imperial")).toBe("100 ft");
    expect(formatSpeed(10, "imperial")).toBe("22.4 mph");
    expect(formatElevation(100, 200, "imperial")).toBe("328–656 ft");
  });
});
