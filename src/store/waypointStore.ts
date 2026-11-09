import type { Waypoint } from "../control/missionClient.ts";

let points: Waypoint[] = [];
const listeners = new Set<() => void>();

function update(next: Waypoint[]): void {
  points = next;
  listeners.forEach((listener) => { listener(); });
}

export const waypointStore = {
  get: (): readonly Waypoint[] => points,
  add: (x: number, y: number): void => {
    update([...points, { x, y, arrival_radius_m: 0 }]);
  },
  remove: (index: number): void => {
    update(points.filter((_, pointIndex) => pointIndex !== index));
  },
  move: (index: number, offset: number): void => {
    const target = index + offset;
    if (target < 0 || target >= points.length || !points[index]) return;
    const reordered = points.filter((_, pointIndex) => pointIndex !== index);
    update([...reordered.slice(0, target), points[index], ...reordered.slice(target)]);
  },
  radius: (index: number, value: number): void => {
    if (!points[index] || !Number.isFinite(value) || value < 0) return;
    update(points.map((point, pointIndex) => pointIndex === index ? { ...point, arrival_radius_m: value } : point));
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
