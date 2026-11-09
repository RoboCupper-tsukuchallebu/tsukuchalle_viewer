import { ArrowHelper, BoxGeometry, BufferGeometry, CanvasTexture, Color, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Sprite, SpriteMaterial, Vector3, type Object3D, type Scene } from "three";
import { setObjectTransform } from "./frameTransform.ts";
import type { TransformTree } from "./transformTree.ts";
import { isQuaternion, isRecord, isVector } from "./valueGuards.ts";

type Marker = { header: { frame_id: string }; ns: string; id: number; type: number; action: number; pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } }; scale: { x: number; y: number; z: number }; color: { r: number; g: number; b: number; a: number }; lifetime: { sec: number; nanosec: number }; points: { x: number; y: number; z: number }[]; colors: { r: number; g: number; b: number; a: number }[]; text: string };
const colorValid = (v: unknown): v is Marker["color"] => isRecord(v) && [v.r, v.g, v.b, v.a].every((n) => typeof n === "number" && Number.isFinite(n));
export function parseMarker(value: unknown): Marker | undefined {
  if (!isRecord(value) || !isRecord(value.header) || typeof value.header.frame_id !== "string" || typeof value.ns !== "string" || !Number.isInteger(value.id) || !Number.isInteger(value.type) || !Number.isInteger(value.action)) return undefined;
  if (value.action === 2 || value.action === 3) return value as Marker;
  if (!isRecord(value.pose) || !isVector(value.pose.position) || !isQuaternion(value.pose.orientation) || !isVector(value.scale) || !colorValid(value.color) || !isRecord(value.lifetime) || typeof value.lifetime.sec !== "number" || typeof value.lifetime.nanosec !== "number" || !Array.isArray(value.points) || !value.points.every(isVector) || !Array.isArray(value.colors) || !value.colors.every(colorValid) || typeof value.text !== "string") return undefined;
  return value as Marker;
}
function dispose(object: Object3D): void {
  object.traverse((child) => {
    const item = child as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void; map?: { dispose(): void } | null } | { dispose(): void; map?: { dispose(): void } | null }[] };
    item.geometry?.dispose();
    for (const material of item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : []) { material.map?.dispose(); material.dispose(); }
  });
}
function vector(p: { x: number; y: number; z: number }): Vector3 { return new Vector3(p.x, p.y, p.z); }
function makeObject(m: Marker): Object3D | undefined {
  const color = new Color(m.color.r, m.color.g, m.color.b);
  const material = () => new MeshBasicMaterial({ color, transparent: m.color.a < 1, opacity: m.color.a, depthWrite: m.color.a >= 1 });
  const points = m.points.map(vector);
  if (m.type === 4 || m.type === 5) {
    const geometry = new BufferGeometry().setFromPoints(points);
    if (m.colors.length === points.length && points.length) geometry.setAttribute("color", new (requireFloatAttribute())(m.colors.flatMap((c) => [c.r, c.g, c.b]), 3));
    const mat = new LineBasicMaterial({ color: m.colors.length === points.length && points.length ? 0xffffff : color, vertexColors: m.colors.length === points.length && points.length > 0, transparent: m.color.a < 1, opacity: m.color.a });
    return m.type === 4 ? new Line(geometry, mat) : new LineSegments(geometry, mat);
  }
  if (m.type === 1) { const mesh = new Mesh(new BoxGeometry(1, 1, 1), material()); mesh.scale.set(m.scale.x, m.scale.y, m.scale.z); return mesh; }
  if (m.type === 7) {
    const group = new Group();
    points.forEach((p, i) => { const mat = material(); if (m.colors.length === points.length) { const c = m.colors[i]; if (c) { mat.color.setRGB(c.r, c.g, c.b); mat.opacity = c.a; mat.transparent = c.a < 1; } } const mesh = new Mesh(new SphereGeometry(0.5, 12, 8), mat); mesh.position.copy(p); mesh.scale.set(m.scale.x, m.scale.y, m.scale.z); group.add(mesh); });
    return group;
  }
  if (m.type === 0) {
    const origin = points.length >= 2 ? (points[0] ?? new Vector3()) : new Vector3();
    const delta = points.length >= 2 ? (points[1] ?? new Vector3()).clone().sub(origin) : new Vector3(m.scale.x, 0, 0);
    const length = delta.length(); if (!length) return new Group();
    const headLength = points.length >= 2 ? (m.scale.z || length * 0.2) : length * 0.23;
    const arrow = new ArrowHelper(delta.normalize(), origin, length, color, headLength, points.length >= 2 ? m.scale.y : m.scale.z);
    for (const part of [arrow.line, arrow.cone]) { const materials = Array.isArray(part.material) ? part.material : [part.material]; for (const mat of materials) { mat.transparent = m.color.a < 1; mat.opacity = m.color.a; } }
    return arrow;
  }
  if (m.type === 9) {
    const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d"); if (!ctx) return undefined;
    ctx.font = "48px sans-serif"; canvas.width = Math.max(1, Math.ceil(ctx.measureText(m.text).width + 8)); canvas.height = 64;
    ctx.font = "48px sans-serif"; ctx.fillStyle = `rgba(${Math.round(m.color.r * 255)},${Math.round(m.color.g * 255)},${Math.round(m.color.b * 255)},${m.color.a})`; ctx.textBaseline = "middle"; ctx.fillText(m.text, 4, 32);
    const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false })); sprite.scale.set(m.scale.z * canvas.width / canvas.height, m.scale.z, 1); return sprite;
  }
  return undefined;
}
import { Float32BufferAttribute } from "three";
function requireFloatAttribute() { return Float32BufferAttribute; }
export function createMarkerLayer(scene: Scene, tree: TransformTree, selectedFrame: () => string) {
  const entries = new Map<string, { root: Group; frame: string; expires: number }>();
  const remove = (key: string) => { const entry = entries.get(key); if (entry) { scene.remove(entry.root); dispose(entry.root); entries.delete(key); } };
  const clear = () => { for (const key of entries.keys()) remove(key); };
  return { entries, clear, update(value: unknown, now: number) {
    if (!isRecord(value) || !Array.isArray(value.markers)) return;
    for (const raw of value.markers) {
      const m = parseMarker(raw); if (!m) continue;
      if (m.action === 3) { clear(); continue; }
      const key = JSON.stringify([m.ns, m.id]);
      if (m.action === 2) { remove(key); continue; }
      if (m.action !== 0) continue;
      const object = makeObject(m); if (!object) { remove(key); continue; }
      remove(key); const root = new Group(); const pose = new Group(); pose.position.copy(vector(m.pose.position)); pose.quaternion.copy(new Quaternion(m.pose.orientation.x, m.pose.orientation.y, m.pose.orientation.z, m.pose.orientation.w)); pose.add(object); root.add(pose); scene.add(root);
      const duration = m.lifetime.sec * 1000 + m.lifetime.nanosec / 1e6;
      entries.set(key, { root, frame: m.header.frame_id, expires: duration > 0 ? now + duration : Infinity });
    }
  }, refresh(now: number) { for (const [key, entry] of entries) { if (now >= entry.expires) remove(key); else setObjectTransform(entry.root, entry.frame, selectedFrame(), tree); } } };
}
