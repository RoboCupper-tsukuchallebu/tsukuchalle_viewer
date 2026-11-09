import { Group, type Object3D } from "three";
import type { GroundClickResult } from "./groundClick.ts";

const accepted = new Set<(point: { x: number; y: number }) => void>();
const rejected = new Set<(reason: string) => void>();
const overlays = new Set<Object3D>();
let scene: Group | undefined;

export function onGroundClick(listener: (point: { x: number; y: number }) => void): () => void {
  accepted.add(listener); return () => { accepted.delete(listener); };
}
export function onGroundClickRejected(listener: (reason: string) => void): () => void {
  rejected.add(listener); return () => { rejected.delete(listener); };
}
export function addOverlay(object: Object3D): () => void {
  overlays.add(object); scene?.add(object);
  return () => { overlays.delete(object); object.removeFromParent(); };
}
/** パネルの寿命と独立して登録したオーバーレイを付け替える。 */
export function attachOverlays(group: Group): () => void {
  scene = group; overlays.forEach((object) => group.add(object));
  return () => { if (scene === group) scene = undefined; overlays.forEach((object) => { if (object.parent === group) group.remove(object); }); };
}
export function notifyGroundClick(result: GroundClickResult): void {
  if (result.isPlaceable) accepted.forEach((listener) => { listener({ x: result.x, y: result.y }); });
  else rejected.forEach((listener) => { listener(result.reason); });
}
