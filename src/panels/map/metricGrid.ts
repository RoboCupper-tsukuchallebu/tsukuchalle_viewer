import { statusColor, toMetres, type Fix } from "./model.ts";
import { trailDefinitions } from "./ui.ts";

export function gridOffsets(extent: number, gridStep: number): number[] {
  const offsets: number[] = [];
  for (let offset = Math.ceil(-2 * extent / gridStep) * gridStep; offset <= 2 * extent; offset += gridStep) {
    offsets.push(offset);
  }
  return offsets;
}

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
  for (const offset of gridOffsets(extent, gridStep)) {
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
    trail.forEach((point, pointIndex) => {
      const fix = trails[index]?.[pointIndex];
      if (!fix) return;
      drawing.fillStyle = statusColor(fix.status);
      drawing.beginPath();
      drawing.arc(centerX + point.east * scale, centerY - point.north * scale, 3, 0, Math.PI * 2);
      drawing.fill();
    });
  });
  drawing.fillStyle = "#222";
  drawing.fillText(`格子間隔: ${gridStep} m`, 10, 20);
}
