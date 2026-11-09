import { createElement } from "../../layout/dom.ts";
import type { Satellite, Signal } from "./parseSatellites.ts";
import { cn0Color, svgElement } from "./skyPlot.ts";

const BAR_VIEWBOX_WIDTH = 300;
const BAR_VIEWBOX_HEIGHT = 12;
const BAR_REFERENCE_CN0 = 60;

function createSignalRow(satellite: Satellite, signal: Signal): HTMLElement {
  const row = createElement("div", "satellites-signal-row");
  const description = /^sig(?:\d+|\?)$/.test(signal.name) ? `${signal.name}（不明な信号）` : signal.name;
  row.append(createElement("span", undefined, `${satellite.prn} ${description} ${signal.cn0}`));
  const svg = svgElement("svg", { viewBox: `0 0 ${BAR_VIEWBOX_WIDTH} ${BAR_VIEWBOX_HEIGHT}`, class: "satellites-bar", "aria-hidden": "true" });
  const width = Math.min(signal.cn0 ?? 0, BAR_REFERENCE_CN0) / BAR_REFERENCE_CN0 * BAR_VIEWBOX_WIDTH;
  svg.append(svgElement("rect", { x: "0", y: "0", width: String(width), height: String(BAR_VIEWBOX_HEIGHT), fill: cn0Color(signal.cn0) }));
  row.append(svg);
  return row;
}

export function createCn0Bars(satellites: Satellite[]): HTMLElement {
  const section = createElement("section");
  section.append(createElement("h3", undefined, "衛星系ごとの C/N0（dB-Hz）"));
  for (const system of new Set(satellites.map((satellite) => satellite.system))) {
    section.append(createElement("h4", undefined, system));
    for (const satellite of satellites.filter((item) => item.system === system)) {
      for (const signal of satellite.signals) {
        if (signal.cn0 !== null) {
          section.append(createSignalRow(satellite, signal));
        }
      }
    }
  }
  return section;
}
