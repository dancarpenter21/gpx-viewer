# GPX Viewer

A browser-based GPX viewer built with Vite, TypeScript, and CesiumJS. Drop one or more GPX files onto the map to compare routes in 2D or 3D. Files are parsed locally and are never uploaded.

## Features

- Drag-and-drop and multi-file GPX loading
- Independently colored routes with visibility, focus, and remove controls
- Per-leg hover/tap details for recorded speed and compass direction
- Start/end time, distance, duration, point count, elevation, and speed statistics
- 2D and 3D Cesium views with OpenStreetMap imagery
- Public global terrain in 3D mode, with no API key required

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

## 3D terrain

The viewer loads Esri World Elevation terrain when it starts, so hills and mountains are visible in 3D mode without an API key. Use the 3D terrain switch to return to the WGS84 ellipsoid when desired.

## Docker

Start the development profile with source-mounted hot reloading:

```bash
docker compose --profile dev up --build
```

Open `http://localhost:5173`. Changes to the source files are picked up by Vite without rebuilding the image. Stop the environment with `docker compose --profile dev down`.

Run the Playwright browser suite in its dedicated test container with:

```bash
docker compose --profile test run --build --rm viewer-test
```

The test image includes Chromium and its system dependencies; the smaller development image does not. The test command builds the current source before starting Playwright's preview server, runs independently of the hot-reload service, and uses one worker with a container-specific timeout to keep Cesium/WebGL tests reliable under software rendering.

To run the production profile instead:

```bash
docker compose --profile production up --build
```

Open `http://localhost:8080`.

You can also build and run the production image directly:

```bash
docker build -t gpx-viewer .
docker run --rm -p 8080:80 gpx-viewer
```

Open `http://localhost:8080`. The image runs the tests and production build in a Node stage, then serves only the generated static assets from Nginx.

The container exposes `/healthz` and includes a Docker health check.
