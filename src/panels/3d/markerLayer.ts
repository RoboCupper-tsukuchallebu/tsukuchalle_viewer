import { ArrowHelper, BoxGeometry, BufferGeometry, Float32BufferAttribute, CanvasTexture, Color, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Sprite, SpriteMaterial, Vector3, type Object3D, type Scene } from "three";
import { setObjectTransform } from "./frameTransform.ts";
import type { TransformTree } from "./transformTree.ts";
import { isQuaternion, isRecord, isVector } from "./valueGuards.ts";

type Marker = {
  header: { frame_id: string };
  ns: string;
  id: number;
  type: number;
  action: number;
  pose: { position: Point; orientation: { x: number; y: number; z: number; w: number } };
  scale: Point;
  color: MarkerColor;
  lifetime: { sec: number; nanosec: number };
  points: Point[];
  colors: MarkerColor[];
  text: string;
};
type Point = { x: number; y: number; z: number };
type MarkerColor = { r: number; g: number; b: number; a: number };

const sphereGeometry = new SphereGeometry(0.5, 12, 8);

function colorValid(value: unknown): value is MarkerColor {
  return isRecord(value) && [value.r, value.g, value.b, value.a].every(
    (component) => typeof component === "number" && Number.isFinite(component),
  );
}

export function parseMarker(value: unknown): Marker | undefined {
  if (!isRecord(value) || !isRecord(value.header) || typeof value.header.frame_id !== "string" ||
      typeof value.ns !== "string" || !Number.isInteger(value.id) ||
      !Number.isInteger(value.type) || !Number.isInteger(value.action)) return undefined;
  if (value.action === 2 || value.action === 3) return value as Marker;
  if (!isRecord(value.pose) || !isVector(value.pose.position) || !isQuaternion(value.pose.orientation) ||
      !isVector(value.scale) || !colorValid(value.color) || !isRecord(value.lifetime) ||
      typeof value.lifetime.sec !== "number" || typeof value.lifetime.nanosec !== "number" ||
      !Array.isArray(value.points) || !value.points.every(isVector) || !Array.isArray(value.colors) ||
      !value.colors.every(colorValid) || typeof value.text !== "string") return undefined;
  return value as Marker;
}

function dispose(object: Object3D): void {
  if (object instanceof ArrowHelper) {
    object.dispose();
    return;
  }
  if (object instanceof Sprite) {
    object.material.map?.dispose();
    object.material.dispose();
    return;
  }
  if (object instanceof Mesh || object instanceof Line || object instanceof LineSegments) {
    const drawable = object as Mesh;
    if (drawable.geometry !== sphereGeometry) drawable.geometry.dispose();
    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    for (const material of materials) material.dispose();
  }
  for (const child of object.children) dispose(child);
}

function vector(point: Point): Vector3 {
  return new Vector3(point.x, point.y, point.z);
}

function meshMaterial(marker: Marker): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(marker.color.r, marker.color.g, marker.color.b),
    transparent: marker.color.a < 1,
    opacity: marker.color.a,
    depthWrite: marker.color.a >= 1,
  });
}

function makeLine(marker: Marker): Object3D {
  const geometry = new BufferGeometry().setFromPoints(marker.points.map(vector));
  const vertexColors = marker.colors.length === marker.points.length && marker.points.length > 0;
  if (vertexColors) {
    geometry.setAttribute("color", new Float32BufferAttribute(
      marker.colors.flatMap((color) => [color.r, color.g, color.b]), 3,
    ));
  }
  const material = new LineBasicMaterial({
    color: vertexColors ? 0xffffff : new Color(marker.color.r, marker.color.g, marker.color.b),
    vertexColors,
    transparent: marker.color.a < 1,
    opacity: marker.color.a,
  });
  return marker.type === 4 ? new Line(geometry, material) : new LineSegments(geometry, material);
}

function makeCube(marker: Marker): Object3D {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), meshMaterial(marker));
  mesh.scale.set(marker.scale.x, marker.scale.y, marker.scale.z);
  return mesh;
}

function makeSpheres(marker: Marker): Object3D {
  const group = new Group();
  marker.points.forEach((point, index) => {
    const material = meshMaterial(marker);
    const color = marker.colors.length === marker.points.length ? marker.colors[index] : undefined;
    if (color) {
      material.color.setRGB(color.r, color.g, color.b);
      material.opacity = color.a;
      material.transparent = color.a < 1;
    }
    const mesh = new Mesh(sphereGeometry, material);
    mesh.position.copy(vector(point));
    mesh.scale.set(marker.scale.x, marker.scale.y, marker.scale.z);
    group.add(mesh);
  });
  return group;
}

function makeArrow(marker: Marker): Object3D {
  const points = marker.points.map(vector);
  const origin = points.length >= 2 ? points[0] : new Vector3();
  if (!origin) return new Group();
  const delta = points.length >= 2 && points[1]
    ? points[1].clone().sub(origin) : new Vector3(marker.scale.x, 0, 0);
  const length = delta.length();
  if (!length) return new Group();
  const headLength = points.length >= 2 ? (marker.scale.z || length * 0.2) : length * 0.23;
  const arrow = new ArrowHelper(delta.normalize(), origin, length,
    new Color(marker.color.r, marker.color.g, marker.color.b), headLength,
    points.length >= 2 ? marker.scale.y : marker.scale.z);
  for (const part of [arrow.line, arrow.cone]) {
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    for (const material of materials) {
      material.transparent = marker.color.a < 1;
      material.opacity = marker.color.a;
    }
  }
  return arrow;
}

function makeText(marker: Marker): Object3D | undefined {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.font = "48px sans-serif";
  canvas.width = Math.max(1, Math.ceil(context.measureText(marker.text).width + 8));
  canvas.height = 64;
  context.font = "48px sans-serif";
  context.fillStyle = `rgba(${Math.round(marker.color.r * 255)},${Math.round(marker.color.g * 255)},${Math.round(marker.color.b * 255)},${marker.color.a})`;
  context.textBaseline = "middle";
  context.fillText(marker.text, 4, 32);
  const material = new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.scale.set(marker.scale.z * canvas.width / canvas.height, marker.scale.z, 1);
  return sprite;
}

function makeObject(marker: Marker): Object3D | undefined {
  switch (marker.type) {
    case 0: return makeArrow(marker);
    case 1: return makeCube(marker);
    case 4:
    case 5: return makeLine(marker);
    case 7: return makeSpheres(marker);
    case 9: return makeText(marker);
    default: return undefined;
  }
}
export function createMarkerLayer(scene: Scene, tree: TransformTree, selectedFrame: () => string) {
  const entries = new Map<string, { root: Group; frame: string; expires: number }>();
  function remove(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    scene.remove(entry.root);
    dispose(entry.root);
    entries.delete(key);
  }
  function clear(): void {
    for (const key of entries.keys()) remove(key);
  }
  function update(value: unknown, now: number): void {
    if (!isRecord(value) || !Array.isArray(value.markers)) return;
    for (const rawMarker of value.markers) {
      const marker = parseMarker(rawMarker);
      if (!marker) continue;
      if (marker.action === 3) {
        clear();
        continue;
      }
      const key = JSON.stringify([marker.ns, marker.id]);
      if (marker.action === 2) {
        remove(key);
        continue;
      }
      if (marker.action !== 0) continue;
      const object = makeObject(marker);
      remove(key);
      if (!object) continue;
      const root = new Group();
      const pose = new Group();
      pose.position.copy(vector(marker.pose.position));
      const orientation = marker.pose.orientation;
      pose.quaternion.copy(new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w));
      pose.add(object);
      root.add(pose);
      scene.add(root);
      const duration = marker.lifetime.sec * 1000 + marker.lifetime.nanosec / 1e6;
      entries.set(key, { root, frame: marker.header.frame_id, expires: duration > 0 ? now + duration : Infinity });
    }
  }
  function refresh(now: number): string[] {
    const missingFrames = new Set<string>();
    for (const [key, entry] of entries) {
      if (now >= entry.expires) {
        remove(key);
      } else if (!entry.frame || !setObjectTransform(entry.root, entry.frame, selectedFrame(), tree)) {
        entry.root.visible = false;
        missingFrames.add(entry.frame || "(空の frame_id)");
      }
    }
    return [...missingFrames];
  }
  return { entries, clear, update, refresh };
}
