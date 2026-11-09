import { BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, RGBAFormat, UnsignedByteType, Vector3, type Scene } from "three";
import { isQuaternion, isRecord, isVector } from "./valueGuards.ts";

export const obstacleHeight = 0.02;
export const obstacleUpdateIntervalMs = 200;
export const obstacleStatusFields = { stop: "is_stop_zone_occupied", slow: "is_slow_zone_occupied", distance: "nearest_distance_m" } as const;

type Grid = { frame: string; width: number; height: number; resolution: number; position: Vector3; rotation: Quaternion; data: number[] };
export function readObstacleGrid(value: unknown): Grid | undefined {
  if (!isRecord(value) || !isRecord(value.header) || typeof value.header.frame_id !== "string" || !isRecord(value.info) || !isRecord(value.info.origin)) return undefined;
  const { width, height, resolution, origin } = value.info;
  if (typeof width !== "number" || !Number.isSafeInteger(width) || width <= 0 || typeof height !== "number" || !Number.isSafeInteger(height) || height <= 0 || typeof resolution !== "number" || !Number.isFinite(resolution) || resolution <= 0 || !isVector(origin.position) || !isQuaternion(origin.orientation)) return undefined;
  const data = value.data;
  if (!(Array.isArray(data) || ArrayBuffer.isView(data)) || !("length" in data) || data.length !== width * height) return undefined;
  const values = Array.from(data as ArrayLike<number>);
  if (!values.every((item) => Number.isInteger(item) && item >= -1 && item <= 100)) return undefined;
  return { frame: value.header.frame_id, width, height, resolution, position: new Vector3(origin.position.x, origin.position.y, origin.position.z), rotation: new Quaternion(origin.orientation.x, origin.orientation.y, origin.orientation.z, origin.orientation.w).normalize(), data: values };
}
export function gridPixels(grid: Grid, showUnknown: boolean): Uint8Array {
  const pixels = new Uint8Array(grid.data.length * 4);
  grid.data.forEach((value, index) => {
    if (value > 0) pixels.set([255, 0, 0, 150], index * 4);
    else if (value === -1 && showUnknown) pixels.set([150, 150, 150, 150], index * 4);
  });
  return pixels;
}
export function formatObstacleStatus(value: unknown): string {
  if (!isRecord(value)) return "障害物状態: 受信待ち";
  const stop = value[obstacleStatusFields.stop], slow = value[obstacleStatusFields.slow], distance = value[obstacleStatusFields.distance];
  if (typeof stop !== "boolean" || typeof slow !== "boolean" || typeof distance !== "number" || Number.isNaN(distance)) return "障害物状態: 形式を読めません";
  return `stop: ${stop ? "占有" : "空き"} / slow: ${slow ? "占有" : "空き"} / 最近傍: ${Number.isFinite(distance) ? `${distance.toFixed(2)} m` : "なし"}`;
}
export function zonePoints(length: number, width: number): number[] {
  return [0, -width / 2, obstacleHeight, length, -width / 2, obstacleHeight, length, width / 2, obstacleHeight, 0, width / 2, obstacleHeight];
}
export function createObstacleLayer(scene: Scene) {
  const gridGroup = new Group(), zoneGroup = new Group();
  scene.add(gridGroup, zoneGroup);
  let mesh: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  let texture: DataTexture | undefined;
  let grid: Grid | undefined;
  let frame = "";
  const lines: LineLoop[] = [];
  function updateZones(dimensions: number[]): void {
    lines.forEach((line) => { zoneGroup.remove(line); line.geometry.dispose(); (line.material as LineBasicMaterial).dispose(); });
    lines.length = 0;
    for (let index = 0; index < 2; index++) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(zonePoints(dimensions[index * 2] ?? 0, dimensions[index * 2 + 1] ?? 0), 3));
      const line = new LineLoop(geometry, new LineBasicMaterial({ color: index === 0 ? 0xff3333 : 0xffcc33 }));
      lines.push(line); zoneGroup.add(line);
    }
  }
  function draw(showUnknown: boolean): void {
    if (!grid) return;
    const pixels = gridPixels(grid, showUnknown);
    if (!texture || texture.image.width !== grid.width || texture.image.height !== grid.height) {
      if (mesh) { gridGroup.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      texture?.dispose();
      texture = new DataTexture(pixels, grid.width, grid.height, RGBAFormat, UnsignedByteType);
      mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: DoubleSide }));
      gridGroup.add(mesh);
    } else texture.image.data?.set(pixels);
    texture.needsUpdate = true;
    if (mesh) {
      mesh.scale.set(grid.width * grid.resolution, grid.height * grid.resolution, 1);
      mesh.position.set(grid.width * grid.resolution / 2, grid.height * grid.resolution / 2, obstacleHeight).applyQuaternion(grid.rotation).add(grid.position);
      mesh.quaternion.copy(grid.rotation);
    }
  }
  updateZones([0.5, 0.8, 2.5, 1.2]);
  return { gridGroup, zoneGroup, get frame() { return frame; }, update(value: unknown, showUnknown: boolean): boolean { const parsed = readObstacleGrid(value); if (!parsed) return false; grid = parsed; frame = grid.frame; draw(showUnknown); return true; }, redraw(showUnknown: boolean) { draw(showUnknown); }, updateZones, clear() { grid = undefined; frame = ""; gridGroup.visible = false; zoneGroup.visible = false; }, dispose() { scene.remove(gridGroup, zoneGroup); mesh?.geometry.dispose(); mesh?.material.dispose(); texture?.dispose(); lines.forEach((line) => { line.geometry.dispose(); (line.material as LineBasicMaterial).dispose(); }); } };
}
