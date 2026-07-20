import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

import {
  ArcGISTiledElevationTerrainProvider,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  HeightReference,
  ImageryLayer,
  LabelStyle,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
} from "cesium";
import {
  createIcons,
  Eye,
  EyeOff,
  FileUp,
  Focus,
  Map as MapIcon,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Upload,
  X,
} from "lucide";
import { calculateStats, getLegMetrics, type LegMetrics, type RouteStats } from "./geo";
import { allPoints, parseGpx, type GpxPoint, type ParsedGpx } from "./gpx";
import { formatDistance, formatElevation, formatSpeed, unitSystemForLocales, type UnitSystem } from "./units";

const ROUTE_COLORS = ["#f6c945", "#35d5c5", "#ff6f61", "#7ab8ff", "#d79cff", "#a9df68", "#ff9d4d", "#f281b5"];
const APP_ICONS = { Eye, EyeOff, FileUp, Focus, Map: MapIcon, Maximize, PanelLeftClose, PanelLeftOpen, Route, Upload, X };
const PUBLIC_TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

interface LoadedRoute {
  id: string;
  sourceName: string;
  gpx: ParsedGpx;
  stats: RouteStats;
  color: string;
  dataSource: CustomDataSource;
  visible: boolean;
}

interface LegHit {
  entity: Entity;
  routeId: string;
  routeName: string;
  color: Color;
  metrics: LegMetrics;
}

const panel = document.querySelector<HTMLElement>("#panel")!;
const dropOverlay = document.querySelector<HTMLElement>("#dropOverlay")!;
const tooltip = document.querySelector<HTMLElement>("#tooltip")!;
const toastRegion = document.querySelector<HTMLElement>("#toastRegion")!;

const viewer = new Viewer("cesiumContainer", {
  animation: false,
  baseLayer: new ImageryLayer(new OpenStreetMapImageryProvider({
    url: "https://tile.openstreetmap.org/",
  })),
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  terrainProvider: new EllipsoidTerrainProvider(),
});

viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20;

const routes: LoadedRoute[] = [];
const legHits = new Map<Entity, LegHit>();
let selectedRouteId: string | undefined;
let activeLeg: LegHit | undefined;
let sceneMode: "2d" | "3d" = "3d";
let terrainEnabled = false;
let terrainLoading = false;
let publicTerrain: ArcGISTiledElevationTerrainProvider | undefined;
let dragDepth = 0;

const storedUnitSystem = (() => {
  try {
    const stored = localStorage.getItem("gpx-viewer-unit-system");
    return stored === "metric" || stored === "imperial" ? stored : undefined;
  } catch {
    return undefined;
  }
})();
let unitSystem: UnitSystem = storedUnitSystem ?? unitSystemForLocales(navigator.languages);

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return "--";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${remaining}s`;
}

function formatDateTime(value?: Date): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function aggregateStats(): RouteStats {
  const visibleRoutes = routes.filter((route) => route.visible);
  const values = visibleRoutes.map((route) => route.stats);
  const elevations = values.flatMap((stats) => [stats.minElevation, stats.maxElevation]).filter((value): value is number => value !== undefined);
  const durations = values.flatMap((stats) => stats.durationSeconds === undefined ? [] : [stats.durationSeconds]);
  const distanceMeters = values.reduce((total, stats) => total + stats.distanceMeters, 0);
  const durationSeconds = durations.length ? durations.reduce((total, duration) => total + duration, 0) : undefined;
  const maximumSpeeds = values.flatMap((stats) => stats.maxSpeedMetersPerSecond === undefined ? [] : [stats.maxSpeedMetersPerSecond]);
  const startTimes = values.flatMap((stats) => stats.startTime === undefined ? [] : [stats.startTime.getTime()]);
  const endTimes = values.flatMap((stats) => stats.endTime === undefined ? [] : [stats.endTime.getTime()]);

  return {
    pointCount: values.reduce((total, stats) => total + stats.pointCount, 0),
    distanceMeters,
    startTime: startTimes.length ? new Date(Math.min(...startTimes)) : undefined,
    endTime: endTimes.length ? new Date(Math.max(...endTimes)) : undefined,
    durationSeconds,
    minElevation: elevations.length ? Math.min(...elevations) : undefined,
    maxElevation: elevations.length ? Math.max(...elevations) : undefined,
    averageSpeedMetersPerSecond: durationSeconds ? distanceMeters / durationSeconds : undefined,
    maxSpeedMetersPerSecond: maximumSpeeds.length ? Math.max(...maximumSpeeds) : undefined,
  };
}

function statsMarkup(stats: RouteStats): string {
  return `
    <dl class="stats-grid">
      <div><dt>Distance</dt><dd>${formatDistance(stats.distanceMeters, unitSystem)}</dd></div>
      <div><dt>Duration</dt><dd>${formatDuration(stats.durationSeconds)}</dd></div>
      <div><dt>Points</dt><dd>${stats.pointCount.toLocaleString()}</dd></div>
      <div><dt>Elevation</dt><dd>${formatElevation(stats.minElevation, stats.maxElevation, unitSystem)}</dd></div>
      <div><dt>Avg speed</dt><dd>${formatSpeed(stats.averageSpeedMetersPerSecond, unitSystem)}</dd></div>
      <div><dt>Max speed</dt><dd>${formatSpeed(stats.maxSpeedMetersPerSecond, unitSystem)}</dd></div>
      <div class="time-stat"><dt>Start time</dt><dd title="${stats.startTime?.toISOString() ?? "Unavailable"}">${formatDateTime(stats.startTime)}</dd></div>
      <div class="time-stat"><dt>End time</dt><dd title="${stats.endTime?.toISOString() ?? "Unavailable"}">${formatDateTime(stats.endTime)}</dd></div>
    </dl>`;
}

function renderPanel(): void {
  const panelCollapsed = panel.classList.contains("is-collapsed");
  const selected = routes.find((route) => route.id === selectedRouteId);
  const shownStats = selected?.stats ?? aggregateStats();
  const statsTitle = selected ? selected.gpx.name : routes.length > 1 ? "Visible routes" : routes[0]?.gpx.name;
  const routeMarkup = routes.map((route) => `
    <div class="route-row ${route.id === selectedRouteId ? "is-selected" : ""} ${route.visible ? "" : "is-hidden"}" data-select-route="${route.id}">
      <button class="icon-button visibility-button" data-action="visibility" data-id="${route.id}" title="${route.visible ? "Hide" : "Show"} ${escapeHtml(route.gpx.name)}" aria-label="${route.visible ? "Hide" : "Show"} ${escapeHtml(route.gpx.name)}">
        <i data-lucide="${route.visible ? "eye" : "eye-off"}"></i>
      </button>
      <input class="route-swatch" type="color" value="${route.color}" data-route-color="${route.id}" aria-label="Change color for ${escapeHtml(route.gpx.name)}" title="Change route color" />
      <div class="route-copy">
        <strong>${escapeHtml(route.gpx.name)}</strong>
        <span>${escapeHtml(route.sourceName)} · ${formatDistance(route.stats.distanceMeters, unitSystem)}</span>
      </div>
      <button class="icon-button" data-action="zoom" data-id="${route.id}" title="Zoom to route" aria-label="Zoom to ${escapeHtml(route.gpx.name)}">
        <i data-lucide="focus"></i>
      </button>
      <button class="icon-button danger-button" data-action="remove" data-id="${route.id}" title="Remove route" aria-label="Remove ${escapeHtml(route.gpx.name)}">
        <i data-lucide="x"></i>
      </button>
    </div>`).join("");

  panel.innerHTML = `
    <header class="panel-header">
      <div class="brand">
        <span class="brand-mark"><i data-lucide="route"></i></span>
        <div><h1>GPX Viewer</h1><p>${routes.length ? `${routes.length} route${routes.length === 1 ? "" : "s"} loaded` : "Ready for a route"}</p></div>
      </div>
      <button class="icon-button panel-toggle" data-action="collapse" title="${panelCollapsed ? "Expand controls" : "Collapse controls"}" aria-label="${panelCollapsed ? "Expand controls" : "Collapse controls"}"><i data-lucide="${panelCollapsed ? "panel-left-open" : "panel-left-close"}"></i></button>
    </header>
    <div class="panel-body">
      <div class="primary-toolbar">
        <label class="command-button" for="fileInput"><i data-lucide="upload"></i><span>Add GPX</span></label>
        <input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple hidden />
        <div class="segmented" aria-label="Map dimension">
          <button data-action="mode" data-mode="2d" class="${sceneMode === "2d" ? "active" : ""}">2D</button>
          <button data-action="mode" data-mode="3d" class="${sceneMode === "3d" ? "active" : ""}">3D</button>
        </div>
        <button class="icon-button" data-action="home" title="Frame visible routes" aria-label="Frame visible routes" ${routes.length ? "" : "disabled"}><i data-lucide="maximize"></i></button>
      </div>
      <div class="terrain-row">
        <div><span>3D terrain</span><small>${terrainLoading ? "Loading public elevation…" : terrainEnabled ? "Esri World Elevation" : "Ellipsoid"}</small></div>
        <button class="switch ${terrainEnabled ? "is-on" : ""}" role="switch" aria-checked="${terrainEnabled}" data-action="terrain" ${terrainLoading ? "disabled" : ""} aria-label="Toggle 3D terrain"><span></span></button>
      </div>
      <div class="settings-row">
        <div><span>Units</span><small>${unitSystem === "imperial" ? "Miles, feet, and mph" : "Kilometers, meters, and km/h"}</small></div>
        <div class="unit-control">
          <span class="unit-label ${unitSystem === "metric" ? "is-active" : ""}">Metric</span>
          <button class="switch ${unitSystem === "imperial" ? "is-on" : ""}" role="switch" aria-checked="${unitSystem === "imperial"}" data-action="units" aria-label="Use imperial units"><span></span></button>
          <span class="unit-label ${unitSystem === "imperial" ? "is-active" : ""}">Imperial</span>
        </div>
      </div>
      ${routes.length === 0 ? `
        <section class="empty-state">
          <i data-lucide="map"></i>
          <h2>Drop GPX files here</h2>
          <p>or use Add GPX to choose one or more files</p>
        </section>` : `
        <section class="route-section">
          <div class="section-heading"><h2>Routes</h2><button class="text-button" data-action="clear">Clear all</button></div>
          <div class="route-list">${routeMarkup}</div>
        </section>
        <section class="stats-section">
          <div class="section-heading"><h2>${escapeHtml(statsTitle || "Route summary")}</h2>${selected ? `<button class="text-button" data-action="all-stats">All routes</button>` : ""}</div>
          ${statsMarkup(shownStats)}
        </section>`}
    </div>`;

  createIcons({ icons: APP_ICONS });
}

function pointPosition(point: GpxPoint): Cartesian3 {
  return Cartesian3.fromDegrees(point.longitude, point.latitude, point.elevation ?? 0);
}

function addEndpoint(dataSource: CustomDataSource, point: GpxPoint, color: Color, label: string): void {
  dataSource.entities.add({
    position: pointPosition(point),
    point: {
      color,
      outlineColor: Color.fromCssColorString("#111514"),
      outlineWidth: 2,
      pixelSize: 10,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: new NearFarScalar(500, 1.1, 100_000, 0.65),
    },
    label: {
      text: label,
      font: "600 12px Inter, sans-serif",
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString("#111514"),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -11),
      scaleByDistance: new NearFarScalar(500, 1, 100_000, 0.5),
    },
  });
}

function buildRoute(sourceName: string, gpx: ParsedGpx): LoadedRoute {
  const id = crypto.randomUUID();
  const colorHex = ROUTE_COLORS.find((candidate) => !routes.some((route) => route.color === candidate))
    ?? ROUTE_COLORS[routes.length % ROUTE_COLORS.length];
  const color = Color.fromCssColorString(colorHex);
  const dataSource = new CustomDataSource(id);
  let firstPoint: GpxPoint | undefined;
  let lastPoint: GpxPoint | undefined;

  for (const track of gpx.tracks) {
    for (const segment of track.segments) {
      firstPoint ??= segment[0];
      lastPoint = segment.at(-1);
      if (segment.length > 1) {
        dataSource.entities.add({
          polyline: {
            positions: segment.map(pointPosition),
            clampToGround: true,
            width: 4,
            material: new ColorMaterialProperty(color),
          },
        });
      }

      for (let index = 1; index < segment.length; index += 1) {
        const start = segment[index - 1];
        const end = segment[index];
        const entity = dataSource.entities.add({
          polyline: {
            positions: [pointPosition(start), pointPosition(end)],
            clampToGround: true,
            width: 12,
            material: new ColorMaterialProperty(color.withAlpha(0.01)),
          },
        });
        legHits.set(entity, {
          entity,
          routeId: id,
          routeName: gpx.name,
          color,
          metrics: getLegMetrics(start, end),
        });
      }
    }
  }

  if (firstPoint) addEndpoint(dataSource, firstPoint, Color.fromCssColorString("#a9df68"), "START");
  if (lastPoint) addEndpoint(dataSource, lastPoint, Color.fromCssColorString("#ff6f61"), "END");
  void viewer.dataSources.add(dataSource);

  return {
    id,
    sourceName,
    gpx,
    stats: calculateStats(gpx),
    color: colorHex,
    dataSource,
    visible: true,
  };
}

function setRouteColor(route: LoadedRoute, colorHex: string): void {
  const color = Color.fromCssColorString(colorHex);
  route.color = colorHex;

  for (const entity of route.dataSource.entities.values) {
    if (!entity.polyline) continue;
    const leg = legHits.get(entity);
    if (leg) {
      leg.color = color;
      entity.polyline.material = new ColorMaterialProperty(color.withAlpha(activeLeg === leg ? 0.95 : 0.01));
    } else {
      entity.polyline.material = new ColorMaterialProperty(color);
    }
  }

  if (activeLeg?.routeId === route.id) {
    renderLegTooltip(activeLeg, new Cartesian2(Number.parseFloat(tooltip.style.left), Number.parseFloat(tooltip.style.top)));
  }
}

function showToast(message: string, kind: "error" | "success" = "success"): void {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4500);
}

async function loadFiles(files: FileList | File[]): Promise<void> {
  const gpxFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".gpx") || file.type.includes("xml"));
  if (gpxFiles.length === 0) {
    showToast("Choose one or more .gpx files.", "error");
    return;
  }

  const added: LoadedRoute[] = [];
  for (const file of gpxFiles) {
    try {
      const parsed = parseGpx(await file.text(), file.name);
      const route = buildRoute(file.name, parsed);
      routes.push(route);
      added.push(route);
      selectedRouteId = route.id;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to read this file.";
      showToast(`${file.name}: ${reason}`, "error");
    }
  }

  renderPanel();
  if (added.length) {
    zoomToRoutes(added);
    showToast(`${added.length} route${added.length === 1 ? "" : "s"} added.`);
  }
}

function zoomToRoutes(targetRoutes: LoadedRoute[]): void {
  const points = targetRoutes.filter((route) => route.visible).flatMap((route) => allPoints(route.gpx)).map(pointPosition);
  if (!points.length) return;
  const sphere = BoundingSphere.fromPoints(points);
  viewer.camera.flyToBoundingSphere(sphere, { duration: 0.8 });
}

function clearActiveLeg(): void {
  if (activeLeg?.entity.polyline) {
    activeLeg.entity.polyline.material = new ColorMaterialProperty(activeLeg.color.withAlpha(0.01));
    activeLeg.entity.polyline.width = new ConstantProperty(12);
  }
  activeLeg = undefined;
  tooltip.classList.remove("is-visible");
}

function renderLegTooltip(leg: LegHit, position: Cartesian2): void {
  const speed = leg.metrics.speedMetersPerSecond;
  const speedText = speed === undefined ? "Speed unavailable" : formatSpeed(speed, unitSystem);
  const sourceText = leg.metrics.speedSource === "calculated" ? "Calculated speed" : "Recorded speed";
  const directionText = `${Math.round(leg.metrics.bearingDegrees).toString().padStart(3, "0")}° ${leg.metrics.direction}`;
  tooltip.innerHTML = `
    <strong><span style="--route-color: ${routes.find((route) => route.id === leg.routeId)?.color}" class="tooltip-swatch"></span>${escapeHtml(leg.routeName)}</strong>
    <span>${speedText}</span>
    <span>${directionText}${speed === undefined ? "" : ` · ${sourceText}`}</span>`;
  tooltip.style.left = `${position.x}px`;
  tooltip.style.top = `${position.y}px`;
  tooltip.classList.add("is-visible");
}

function showLeg(position: Cartesian2): void {
  const pickedObjects = viewer.scene.drillPick(position, 12) as Array<{ id?: Entity }>;
  const leg = pickedObjects
    .map((picked) => picked.id instanceof Entity ? legHits.get(picked.id) : undefined)
    .find((candidate) => candidate !== undefined);
  if (!leg) {
    clearActiveLeg();
    return;
  }

  if (activeLeg !== leg) {
    clearActiveLeg();
    activeLeg = leg;
    if (leg.entity.polyline) {
      leg.entity.polyline.material = new ColorMaterialProperty(leg.color.withAlpha(0.95));
      leg.entity.polyline.width = new ConstantProperty(7);
    }
  }

  renderLegTooltip(leg, position);
}

async function toggleTerrain(): Promise<void> {
  if (terrainLoading) return;
  terrainLoading = true;
  renderPanel();
  try {
    if (!terrainEnabled) {
      publicTerrain ??= await ArcGISTiledElevationTerrainProvider.fromUrl(PUBLIC_TERRAIN_URL);
      viewer.terrainProvider = publicTerrain;
      terrainEnabled = true;
    } else {
      viewer.terrainProvider = new EllipsoidTerrainProvider();
      terrainEnabled = false;
    }
  } catch {
    showToast("Public terrain could not be loaded. Check your network connection.", "error");
  } finally {
    terrainLoading = false;
    renderPanel();
  }
}

panel.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "fileInput" && input.files) {
    void loadFiles(input.files);
    input.value = "";
  } else if (input.matches("[data-route-color]")) {
    const route = routes.find((candidate) => candidate.id === input.dataset.routeColor);
    if (route) {
      setRouteColor(route, input.value);
      renderPanel();
    }
  }
});

panel.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (!input.matches("[data-route-color]")) return;
  const route = routes.find((candidate) => candidate.id === input.dataset.routeColor);
  if (route) setRouteColor(route, input.value);
});

panel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-route-color]")) return;
  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) {
    const row = target.closest<HTMLElement>("[data-select-route]");
    if (row) {
      selectedRouteId = row.dataset.selectRoute;
      renderPanel();
    }
    return;
  }

  const action = actionElement.dataset.action;
  const route = routes.find((candidate) => candidate.id === actionElement.dataset.id);
  if (action === "mode") {
    sceneMode = actionElement.dataset.mode as "2d" | "3d";
    sceneMode === "2d" ? viewer.scene.morphTo2D(0.6) : viewer.scene.morphTo3D(0.6);
  } else if (action === "home") {
    zoomToRoutes(routes);
  } else if (action === "terrain") {
    void toggleTerrain();
    return;
  } else if (action === "units") {
    unitSystem = unitSystem === "metric" ? "imperial" : "metric";
    try {
      localStorage.setItem("gpx-viewer-unit-system", unitSystem);
    } catch {
      // Unit switching still works when storage is unavailable.
    }
    if (activeLeg) {
      renderLegTooltip(activeLeg, new Cartesian2(Number.parseFloat(tooltip.style.left), Number.parseFloat(tooltip.style.top)));
    }
  } else if (action === "collapse") {
    panel.classList.toggle("is-collapsed");
  } else if (action === "all-stats") {
    selectedRouteId = undefined;
  } else if (action === "clear") {
    for (const loaded of [...routes]) viewer.dataSources.remove(loaded.dataSource, true);
    routes.splice(0);
    legHits.clear();
    selectedRouteId = undefined;
    clearActiveLeg();
  } else if (route && action === "visibility") {
    route.visible = !route.visible;
    route.dataSource.show = route.visible;
    if (!route.visible && activeLeg?.routeId === route.id) clearActiveLeg();
  } else if (route && action === "zoom") {
    zoomToRoutes([route]);
  } else if (route && action === "remove") {
    viewer.dataSources.remove(route.dataSource, true);
    for (const [entity, leg] of legHits) if (leg.routeId === route.id) legHits.delete(entity);
    const index = routes.indexOf(route);
    routes.splice(index, 1);
    if (selectedRouteId === route.id) selectedRouteId = routes.at(-1)?.id;
    if (activeLeg?.routeId === route.id) clearActiveLeg();
  }
  renderPanel();
});

document.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.classList.add("is-visible");
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

document.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    dropOverlay.classList.remove("is-visible");
  }
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove("is-visible");
  if (event.dataTransfer?.files.length) void loadFiles(event.dataTransfer.files);
});

const inputHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
inputHandler.setInputAction((movement: { endPosition: Cartesian2 }) => showLeg(movement.endPosition), ScreenSpaceEventType.MOUSE_MOVE);
inputHandler.setInputAction((movement: { position: Cartesian2 }) => showLeg(movement.position), ScreenSpaceEventType.LEFT_CLICK);

renderPanel();
void toggleTerrain();
