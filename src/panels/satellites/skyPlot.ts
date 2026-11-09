import type { Satellite } from "./parseSatellites.ts";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const PLOT_SIZE = 320;
const PLOT_CENTER = 160;
const PLOT_RADIUS = 120;
const MAX_ELEVATION = 90;
export const LOW_CN0_THRESHOLD = 30;
export const HIGH_CN0_THRESHOLD = 40;

export function svgElement<Tag extends keyof SVGElementTagNameMap>(tag: Tag, attributes: Record<string, string>): SVGElementTagNameMap[Tag] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

export function cn0Color(cn0: number | null): string {
  if (cn0 === null) {
    return "var(--muted)";
  }
  if (cn0 < LOW_CN0_THRESHOLD) {
    return "var(--danger)";
  }
  if (cn0 < HIGH_CN0_THRESHOLD) {
    return "var(--warning)";
  }
  return "var(--accent)";
}

function appendGrid(svg: SVGSVGElement): void {
  for (const elevation of [0, 30, 60, 90]) {
    const radius = PLOT_RADIUS * (MAX_ELEVATION - elevation) / MAX_ELEVATION;
    svg.append(svgElement("circle", { cx: String(PLOT_CENTER), cy: String(PLOT_CENTER), r: String(radius), fill: "none", stroke: "var(--border)" }));
    const label = svgElement("text", { x: String(PLOT_CENTER + 4), y: String(PLOT_CENTER - radius + 12), fill: "var(--muted)", "font-size": "10" });
    label.textContent = `${elevation}°`;
    svg.append(label);
  }
  const north = svgElement("text", { x: String(PLOT_CENTER), y: "25", "text-anchor": "middle", fill: "var(--text)" });
  north.textContent = "北";
  svg.append(north);
}

function appendSatellite(svg: SVGSVGElement, satellite: Satellite): void {
  if (satellite.elevation === null || satellite.azimuth === null) {
    return;
  }
  const radius = PLOT_RADIUS * (MAX_ELEVATION - satellite.elevation) / MAX_ELEVATION;
  const angle = satellite.azimuth * Math.PI / 180;
  const x = PLOT_CENTER + radius * Math.sin(angle);
  const y = PLOT_CENTER - radius * Math.cos(angle);
  const values = satellite.signals.flatMap((signal) => signal.cn0 === null ? [] : [signal.cn0]);
  const maximum = values.length > 0 ? Math.max(...values) : null;
  const circle = svgElement("circle", { cx: String(x), cy: String(y), r: "5", fill: cn0Color(maximum), "data-satellite": `${satellite.system} ${satellite.prn}` });
  const label = svgElement("text", { x: String(x + 6), y: String(y - 5), fill: "var(--text)", "font-size": "10" });
  label.textContent = `${satellite.system} ${satellite.prn}`;
  svg.append(circle, label);
}

export function createSkyPlot(satellites: Satellite[]): SVGSVGElement {
  const svg = svgElement("svg", { viewBox: `0 0 ${PLOT_SIZE} ${PLOT_SIZE}`, class: "satellites-sky-plot", role: "img", "aria-label": "衛星のスカイプロット" });
  appendGrid(svg);
  satellites.forEach((satellite) => {
    appendSatellite(svg, satellite);
  });
  return svg;
}

export function skyPlotLegend(): string {
  return `色の凡例: 赤 <${LOW_CN0_THRESHOLD}、橙 ${LOW_CN0_THRESHOLD}–${HIGH_CN0_THRESHOLD - 1}、青 ${HIGH_CN0_THRESHOLD}以上、灰色 C/N0 なし（dB-Hz）`;
}
