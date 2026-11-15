// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { Scene } from "three";
import fixture from "../fixtures/markerArray.json";
import { createCdrDecoder } from "../../src/decoding/channelDecoder.ts";
import { createMarkerLayer, parseMarker } from "../../src/panels/3d/markerLayer.ts";
import { TransformTree } from "../../src/panels/3d/transformTree.ts";

const schema = `visualization_msgs/Marker[] markers
================================================================================
MSG: visualization_msgs/Marker
std_msgs/Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/Pose pose
geometry_msgs/Vector3 scale
std_msgs/ColorRGBA color
builtin_interfaces/Duration lifetime
bool frame_locked
geometry_msgs/Point[] points
std_msgs/ColorRGBA[] colors
string text
string mesh_resource
bool mesh_use_embedded_materials
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: builtin_interfaces/Duration
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
================================================================================
MSG: std_msgs/ColorRGBA
float32 r
float32 g
float32 b
float32 a`;
const decoded = createCdrDecoder(schema)(Uint8Array.from(fixture)) as { markers: Record<string, unknown>[] };
const marker = decoded.markers[0] as Record<string, unknown>;
it("Jazzy の CDR を解析し各 type を変換する", () => {
  expect(parseMarker(marker)?.ns).toBe("candidates");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ measureText: () => ({ width: 100 }), fillText: () => {} } as unknown as CanvasRenderingContext2D);
  const scene = new Scene(); const layer = createMarkerLayer(scene, new TransformTree(), () => "map");
  for (const type of [0, 1, 4, 5, 7, 9]) {
    layer.update({ markers: [{ ...marker, type, text: "arc" }] }, 0);
    expect(layer.entries.size).toBe(1);
    expect(scene.children).toHaveLength(1);
  }
  layer.clear(); expect(scene.children).toHaveLength(0); vi.restoreAllMocks();
});
it("ns と id で置換、削除、期限切れと DELETEALL を処理する", () => {
  const scene = new Scene(); const layer = createMarkerLayer(scene, new TransformTree(), () => "map");
  layer.update({ markers: [marker, { ...marker, ns: "other" }] }, 10);
  expect(layer.entries.size).toBe(2);
  layer.update({ markers: [{ ...marker, lifetime: { sec: 1, nanosec: 0 } }] }, 20);
  expect(layer.entries.size).toBe(2);
  layer.refresh(1020); expect(layer.entries.size).toBe(1);
  layer.update({ markers: [{ ...marker, ns: "other", action: 2 }] }, 1020); expect(layer.entries.size).toBe(0);
  layer.update({ markers: [marker, { ...marker, id: 8 }, { ...marker, action: 3 }] }, 1020); expect(layer.entries.size).toBe(0);
});
