export interface GpxPoint {
  latitude: number;
  longitude: number;
  elevation?: number;
  time?: Date;
  speed?: number;
}

export interface GpxTrack {
  name: string;
  segments: GpxPoint[][];
}

export interface ParsedGpx {
  name: string;
  tracks: GpxTrack[];
}

function directChild(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => child.localName === localName);
}

function textNumber(element: Element | undefined): number | undefined {
  if (!element) return undefined;
  const value = Number.parseFloat(element.textContent?.trim() ?? "");
  return Number.isFinite(value) ? value : undefined;
}

function parsePoint(element: Element): GpxPoint | undefined {
  const latitude = Number.parseFloat(element.getAttribute("lat") ?? "");
  const longitude = Number.parseFloat(element.getAttribute("lon") ?? "");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;

  const rawTime = directChild(element, "time")?.textContent?.trim();
  const parsedTime = rawTime ? new Date(rawTime) : undefined;
  const extensions = directChild(element, "extensions");
  const speedElement = extensions
    ? Array.from(extensions.getElementsByTagNameNS("*", "speed"))[0]
    : undefined;

  return {
    latitude,
    longitude,
    elevation: textNumber(directChild(element, "ele")),
    time: parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime : undefined,
    speed: textNumber(speedElement),
  };
}

export function parseGpx(xml: string, sourceName = "Route"): ParsedGpx {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("This file is not valid XML.");
  }

  const root = document.documentElement;
  if (root.localName !== "gpx") {
    throw new Error("This file does not contain a GPX document.");
  }

  const metadata = directChild(root, "metadata");
  const metadataName = directChild(metadata ?? root, "name")?.textContent?.trim();
  const trackElements = Array.from(root.getElementsByTagNameNS("*", "trk"));
  const tracks = trackElements.map((trackElement, trackIndex): GpxTrack => {
    const trackName = directChild(trackElement, "name")?.textContent?.trim();
    const segmentElements = Array.from(trackElement.getElementsByTagNameNS("*", "trkseg"));
    const segments = segmentElements
      .map((segment) =>
        Array.from(segment.getElementsByTagNameNS("*", "trkpt"))
          .map(parsePoint)
          .filter((point): point is GpxPoint => point !== undefined),
      )
      .filter((segment) => segment.length > 0);
    return { name: trackName || `Track ${trackIndex + 1}`, segments };
  }).filter((track) => track.segments.length > 0);

  if (tracks.length === 0) {
    throw new Error("No valid track points were found in this GPX file.");
  }

  const fallbackName = sourceName.replace(/\.gpx$/i, "") || "Route";
  return { name: metadataName || tracks[0].name || fallbackName, tracks };
}

export function allPoints(gpx: ParsedGpx): GpxPoint[] {
  return gpx.tracks.flatMap((track) => track.segments.flat());
}
