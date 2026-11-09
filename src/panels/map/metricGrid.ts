import { statusColor, toMetres, type Fix } from "./model.ts";
import { trailDefinitions } from "./ui.ts";

export function drawMetricGrid(canvas: HTMLCanvasElement, origin: Fix, trails: readonly (readonly Fix[])[]): void {
  const drawing = canvas.getContext("2d");
  if (!drawing) return;
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const points = trails.map((trail) => trail.map((fix) => toMetres(origin, fix)));
  const extent = Math.max(10, ...points.flat().map((point) => Math.max(Math.abs(point.east), Math.abs(point.north))));
  const scale = Math.min(canvas.width, canvas.height) / (extent * 2.5);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const gridStep = Math.pow(10, Math.floor(Math.log10(extent)));
  drawing.strokeStyle = "#cccccc";
  drawing.lineWidth = 1;
  for (let offset = -extent * 2; offset <= extent * 2; offset += gridStep) {
    drawing.beginPath();
    drawing.moveTo(centerX + offset * scale, 0);
    drawing.lineTo(centerX + offset * scale, canvas.height);
    drawing.moveTo(0, centerY - offset * scale);
    drawing.lineTo(canvas.width, centerY - offset * scale);
    drawing.stroke();
  }
  points.forEach((trail, index) => {
    drawing.strokeStyle = trailDefinitions[index]?.color ?? "#202020";
    drawing.lineWidth = 2;
    drawing.beginPath();
    trail.forEach((point, pointIndex) => {
      const horizontal = centerX + point.east * scale;
      const vertical = centerY - point.north * scale;
      if (pointIndex === 0) drawing.moveTo(horizontal, vertical);
      else drawing.lineTo(horizontal, vertical);
    });
    drawing.stroke();
    const last = trail.at(-1);
    const fix = trails[index]?.at(-1);
    if (!last || !fix) return;
    drawing.fillStyle = statusColor(fix.status);
    drawing.beginPath();
    drawing.arc(centerX + last.east * scale, centerY - last.north * scale, 6, 0, Math.PI * 2);
    drawing.fill();
  });
  drawing.fillStyle = "#222";
  drawing.fillText(`格子間隔: ${gridStep} m`, 10, 20);
}
