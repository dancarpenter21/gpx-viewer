# GPX Viewer

A browser-based GPX viewer built with Vite, TypeScript, and CesiumJS. Drop one or more GPX files onto the map to compare routes in 2D or 3D. Files are parsed locally and are never uploaded.

## Features

- Drag-and-drop and multi-file GPX loading
- Independently colored routes with visibility, focus, and remove controls
- Per-leg hover/tap details for recorded speed and compass direction
- Start/end time, distance, duration, point count, elevation, and speed statistics
- 2D and 3D Cesium views with OpenStreetMap imagery
- Optional Cesium World Terrain support

The included `sample.gpx` is used by the automated tests and can be loaded manually for a quick demonstration. It is not loaded when the app starts.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`.

Run verification commands with:

```bash
npm run test
npm run build
npm run preview
npm run test:e2e
```

The browser suite requires a local Chromium installation. Install Playwright's browser and OS dependencies once with `npx playwright install --with-deps chromium`.

## Optional 3D terrain

The viewer works without credentials using Cesium's WGS84 ellipsoid. To offer Cesium World Terrain, create a browser-restricted Cesium ion token and provide it when building:

```bash
VITE_CESIUM_ION_TOKEN=your_token npm run build
```

Vite embeds `VITE_CESIUM_ION_TOKEN` in the browser bundle. Treat it as a public client token and restrict its permitted URLs and assets in Cesium ion.

## Docker

Build the production image and run it on port 8080:

```bash
docker build -t gpx-viewer .
docker run --rm -p 8080:80 gpx-viewer
```

Open `http://localhost:8080`. The image runs the tests and production build in a Node stage, then serves only the generated static assets from Nginx.

Build with optional World Terrain support:

```bash
docker build \
  --build-arg VITE_CESIUM_ION_TOKEN=your_token \
  -t gpx-viewer .
```

The container exposes `/healthz` and includes a Docker health check.
