import { topicNames } from "../../config.ts";
import { statusLegend } from "./model.ts";
import { tileSources, type TileSource } from "./tileSources.ts";

export const trailDefinitions = [
  { topic: topicNames.rtkFix, color: "#7823a1" },
  { topic: topicNames.fix, color: "#202020" },
] as const;

export function createMapUi(container: HTMLElement) {
  const root = document.createElement("section");
  root.className = "map-panel";
  const label = document.createElement("label");
  label.textContent = "背景 ";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "地図の背景");
  for (const source of Object.keys(tileSources) as TileSource[]) {
    const option = document.createElement("option");
    option.value = source;
    option.textContent = tileSources[source].label;
    select.append(option);
  }
  label.append(select);
  const legend = document.createElement("p");
  legend.className = "map-legend";
  for (const item of [...trailDefinitions.map((trail) => ({ label: trail.topic, color: trail.color })), ...statusLegend]) {
    const entry = document.createElement("span");
    entry.style.color = item.color;
    entry.textContent = `● ${item.label} `;
    legend.append(entry);
  }
  const stage = document.createElement("div");
  stage.className = "map-stage";
  const mapElement = document.createElement("div");
  mapElement.className = "map-canvas";
  const canvas = document.createElement("canvas");
  canvas.className = "map-grid";
  canvas.hidden = true;
  const waiting = document.createElement("p");
  waiting.className = "map-wait";
  waiting.textContent = "fix を待っています";
  const link = document.createElement("a");
  link.className = "map-attribution";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  stage.append(mapElement, canvas, waiting, link);
  root.append(label, legend, stage);
  container.replaceChildren(root);
  return { root, select, mapElement, canvas, waiting, link };
}
