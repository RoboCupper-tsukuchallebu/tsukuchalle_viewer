import * as leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { mapTiles } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import { appendFix, attribution, maximumTrailPoints, nextTileFailures, readFix, statusColor, tileFailureLimit, type Fix } from "./model.ts";
import { drawMetricGrid } from "./metricGrid.ts";
import { isTileSource, tileSources } from "./tileSources.ts";
import { createMapUi, trailDefinitions } from "./ui.ts";

const initialZoom = 16;

type MapUi = ReturnType<typeof createMapUi>;

function createLayerSelector(ui: MapUi, map: leaflet.Map, onFallback: () => void) {
  let failures = 0;
  let tiles: leaflet.TileLayer | undefined;
  const chooseLayer = (): void => {
    const source = ui.select.value;
    if (!isTileSource(source)) return;
    tiles?.remove();
    tiles?.off("tileerror tileload");
    failures = 0;
    ui.canvas.hidden = true;
    ui.mapElement.hidden = false;
    const credit = attribution(source);
    ui.link.textContent = credit.label;
    ui.link.href = credit.url;
    const minimumZoom = source === "photo" ? mapTiles.photoMinimumNativeZoom : mapTiles.minimumZoom;
    if (map.getZoom() < minimumZoom) map.setZoom(minimumZoom, { animate: false });
    map.setMinZoom(minimumZoom);
    tiles = leaflet.tileLayer(tileSources[source].url, {
      minZoom: minimumZoom, maxZoom: mapTiles.maximumZoom,
      maxNativeZoom: source === "photo" ? mapTiles.photoMaximumNativeZoom : mapTiles.maximumZoom,
      keepBuffer: 0,
    });
    tiles.on("tileerror", () => {
      failures = nextTileFailures(failures, false);
      if (failures < tileFailureLimit) return;
      tiles?.remove();
      ui.mapElement.hidden = true;
      ui.canvas.hidden = false;
      onFallback();
    });
    tiles.on("tileload", () => { failures = nextTileFailures(failures, true); });
    tiles.addTo(map);
    map.invalidateSize();
  };
  return { chooseLayer, dispose: () => { tiles?.remove(); tiles?.off("tileerror tileload"); } };
}

function createRenderer(ui: MapUi) {
  const map = leaflet.map(ui.mapElement, { attributionControl: false, minZoom: mapTiles.minimumZoom, maxZoom: mapTiles.maximumZoom, preferCanvas: true });
  const trails: Fix[][] = trailDefinitions.map(() => []);
  const lines = trailDefinitions.map((trail) => leaflet.polyline([], { color: trail.color }).addTo(map));
  const pointGroups = trailDefinitions.map(() => leaflet.layerGroup().addTo(map));
  const pointMarkers: leaflet.CircleMarker[][] = trailDefinitions.map(() => []);
  let origin: Fix | undefined;
  let fallback = false;
  const draw = (): void => {
    if (origin) drawMetricGrid(ui.canvas, origin, trails);
  };
  const update = (index: number, value: unknown): void => {
    const fix = readFix(value);
    const trail = trails[index];
    const line = lines[index];
    const group = pointGroups[index];
    const markers = pointMarkers[index];
    if (!fix || !trail || !line || !group || !markers) return;
    trails[index] = appendFix(trail, fix);
    if (!origin) {
      origin = fix;
      ui.waiting.hidden = true;
      map.setView([fix.latitude, fix.longitude], initialZoom);
    }
    line.setLatLngs(trails[index].map((point) => [point.latitude, point.longitude]));
    const color = statusColor(fix.status);
    markers.push(leaflet.circleMarker([fix.latitude, fix.longitude], { radius: 3, color, fillColor: color, fillOpacity: 1 }).addTo(group));
    if (markers.length > maximumTrailPoints) {
      const oldest = markers.shift();
      if (oldest) group.removeLayer(oldest);
    }
    if (fallback) draw();
  };
  const resize = (): void => {
    if (fallback) draw();
    else map.invalidateSize();
  };
  const layers = createLayerSelector(ui, map, () => { fallback = true; draw(); });
  const chooseLayer = (): void => { fallback = false; layers.chooseLayer(); };
  ui.select.addEventListener("change", chooseLayer);
  window.addEventListener("resize", resize);
  chooseLayer();
  return { update, dispose: () => {
    ui.select.removeEventListener("change", chooseLayer);
    window.removeEventListener("resize", resize);
    layers.dispose();
    pointGroups.forEach((group) => { group.clearLayers(); });
    map.remove();
  } };
}

export function mountPanel(container: HTMLElement, context: PanelContext): () => void {
  const ui = createMapUi(container);
  const renderer = createRenderer(ui);
  const releases = trailDefinitions.flatMap((trail, index) => {
    const unsubscribe = context.topicStore.subscribe(trail.topic, (entry) => { renderer.update(index, entry.value); });
    const entry = context.topicStore.get(trail.topic);
    if (entry) renderer.update(index, entry.value);
    return [unsubscribe, context.connections.viewing.subscribeToTopic(trail.topic)];
  });
  return () => {
    releases.forEach((release) => { release(); });
    renderer.dispose();
    ui.root.remove();
  };
}
