// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Scene } from "three";
import type { PanelContext } from "../../src/layout/panelContext.ts";
import { createMarkerController } from "../../src/panels/3d/markerController.ts";
import { TransformTree } from "../../src/panels/3d/transformTree.ts";
import { TopicStore } from "../../src/store/topicStore.ts";

const topic = "/lightnav/controller/arc_candidates";
const marker = {
  header: { frame_id: "map" }, ns: "test", id: 1, type: 1, action: 0,
  pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
  scale: { x: 1, y: 1, z: 1 }, color: { r: 1, g: 0, b: 0, a: 1 },
  lifetime: { sec: 0, nanosec: 0 }, points: [], colors: [], text: "",
};
let cleanup: () => void;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup() {
  const root = document.createElement("div");
  const scene = new Scene();
  const store = new TopicStore();
  const release = vi.fn();
  const report = vi.fn();
  const client = {
    channels: new Map([[1, { topic, schemaName: "visualization_msgs/msg/MarkerArray" }]]),
    subscribeToTopic: () => release,
    on: () => () => {},
  };
  const context = { connections: { viewing: client }, topicStore: store } as unknown as PanelContext;
  cleanup = createMarkerController(root, scene, context, new TransformTree(), () => "map", report);
  const send = (...markers: unknown[]) => { store.put(topic, { markers }, 0n); };
  return { root, scene, send, release, report };
}

it("同じ窓の ADD → DELETE を削除として反映する", () => {
  const { scene, send } = setup();
  send(marker);
  send({ ...marker, action: 2 });
  vi.advanceTimersByTime(100);
  expect(scene.children).toHaveLength(0);
});

it("DELETEALL の後の ADD を残す", () => {
  const { scene, send } = setup();
  send(marker);
  vi.advanceTimersByTime(100);
  send({ ...marker, action: 3 }, { ...marker, id: 2 });
  vi.advanceTimersByTime(100);
  expect(scene.children).toHaveLength(1);
});

it("トグルを切ると購読と描画リソースを解放する", () => {
  const { root, scene, send, release } = setup();
  send(marker);
  vi.advanceTimersByTime(100);
  const geometry = (scene.children[0]?.children[0]?.children[0] as import("three").Mesh).geometry;
  const dispose = vi.spyOn(geometry, "dispose");
  const input = root.querySelector("input") as HTMLInputElement;
  input.checked = false;
  input.dispatchEvent(new Event("change"));
  expect(release).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  expect(scene.children).toHaveLength(0);
});

it("100 ms ごとに最新の操作だけを反映する", () => {
  const { scene, send } = setup();
  send(marker);
  vi.advanceTimersByTime(99);
  expect(scene.children).toHaveLength(0);
  send({ ...marker, pose: { ...marker.pose, position: { x: 2, y: 0, z: 0 } } });
  vi.advanceTimersByTime(1);
  expect(scene.children[0]?.children[0]?.position.x).toBe(2);
  send(marker);
  vi.advanceTimersByTime(99);
  expect(scene.children[0]?.children[0]?.position.x).toBe(2);
  vi.advanceTimersByTime(1);
  expect(scene.children[0]?.children[0]?.position.x).toBe(0);
});

it("TF がないフレームと空の frame_id を status に出し、解除で消す", () => {
  const { scene, send, report, root } = setup();
  send({ ...marker, header: { frame_id: "unknown" } }, { ...marker, id: 2, header: { frame_id: "" } });
  vi.advanceTimersByTime(100);
  expect(scene.children.every((object) => !object.visible)).toBe(true);
  expect(report).toHaveBeenLastCalledWith("markers", expect.stringContaining("unknown"));
  expect(report).toHaveBeenLastCalledWith("markers", expect.stringContaining("空の frame_id"));
  const input = root.querySelector("input") as HTMLInputElement;
  input.checked = false;
  input.dispatchEvent(new Event("change"));
  expect(report).toHaveBeenLastCalledWith("markers", "");
});
