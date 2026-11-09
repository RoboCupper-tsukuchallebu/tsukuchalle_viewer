import type { Waypoint } from "../control/missionClient.ts";
class WaypointStore {
  private points: Waypoint[] = [];
  private listeners = new Set<() => void>();
  get(): readonly Waypoint[] { return this.points; }
  add(x: number, y: number): void { this.points.push({ x, y, arrival_radius_m: 0 }); this.notify(); }
  remove(index: number): void { this.points.splice(index, 1); this.notify(); }
  move(index: number, offset: number): void { const target = index + offset; if (target < 0 || target >= this.points.length) return; const point = this.points.splice(index, 1)[0]; if (point) this.points.splice(target, 0, point); this.notify(); }
  radius(index: number, value: number): void { const point = this.points[index]; if (point && Number.isFinite(value) && value >= 0) { point.arrival_radius_m = value; this.notify(); } }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify(): void { this.listeners.forEach((listener) => { listener(); }); }
}
export const waypointStore = new WaypointStore();
