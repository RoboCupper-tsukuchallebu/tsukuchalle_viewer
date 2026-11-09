import * as leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { mapTiles } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import { appendFix, attribution, nextTileFailures, readFix, statusColor, tileFailureLimit, type Fix } from "./model.ts";
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
    tiles?.off();
    tiles?.remove();
    failures = 0;
    ui.canvas.hidden = true;
    ui.mapElement.hidden = false;
    const credit = attribution(source);
    ui.link.textContent = credit.label;
    ui.link.href = credit.url;
    // 写真には 14 未満のタイルがない。Leaflet がズーム 14 のタイルを縮小して表示する。
    tiles = leaflet.tileLayer(tileSources[source].url, {
      minZoom: mapTiles.minimumZoom, maxZoom: mapTiles.maximumZoom,
      minNativeZoom: source === "photo" ? mapTiles.photoMinimumNativeZoom : mapTiles.minimumZoom,
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
  return { chooseLayer, dispose: () => { tiles?.off(); tiles?.remove(); } };
}

function createRenderer(ui: MapUi) {
  const map = leaflet.map(ui.mapElement, { attributionControl: false, minZoom: mapTiles.minimumZoom, maxZoom: mapTiles.maximumZoom });
  const trails: Fix[][] = trailDefinitions.map(() => []);
  const lines = trailDefinitions.map((trail) => leaflet.polyline([], { color: trail.color }).addTo(map));
  const markers = trailDefinitions.map(() => leaflet.circleMarker([0, 0], { radius: 6 }));
  let origin: Fix | undefined;
  let fallback = false;
  const draw = (): void => {
    if (origin) drawMetricGrid(ui.canvas, origin, trails);
  };
  const update = (index: number, value: unknown): void => {
    const fix = readFix(value);
    const trail = trails[index];
    const line = lines[index];
    const marker = markers[index];
    if (!fix || !trail || !line || !marker) return;
    trails[index] = appendFix(trail, fix);
    if (!origin) {
      origin = fix;
      ui.waiting.hidden = true;
      map.setView([fix.latitude, fix.longitude], initialZoom);
    }
    line.setLatLngs(trails[index].map((point) => [point.latitude, point.longitude]));
    marker.setLatLng([fix.latitude, fix.longitude]).setStyle({ color: statusColor(fix.status), fillColor: statusColor(fix.status), fillOpacity: 1 }).addTo(map);
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
