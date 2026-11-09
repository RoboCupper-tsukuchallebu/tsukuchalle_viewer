// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { Scene, Vector3 } from "three";
import { createObstacleLayer, formatObstacleStatus, gridPixels, readObstacleGrid, zonePoints } from "../../src/panels/3d/obstacleLayer.ts";
import { createObstacleController } from "../../src/panels/3d/obstacleController.ts";
import { createControlsForm } from "../../src/panels/3d/controlsForm.ts";
import { TopicStore } from "../../src/store/topicStore.ts";
import { FoxgloveClient } from "../../src/connection/foxgloveClient.ts";
import type { PanelContext } from "../../src/layout/panelContext.ts";
import { topicNames } from "../../src/config.ts";

const grid = { header: { frame_id: "base_footprint" }, info: { width: 3, height: 1, resolution: 0.1, origin: { position: { x: 2, y: 3, z: 0 }, orientation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } } }, data: [0, 100, -1] };
it("セルの値と原点姿勢を描画に反映し、サイズ不一致を拒否する", () => {
  const parsed = readObstacleGrid(grid);
  expect(parsed).toBeDefined();
  if (!parsed) return;
  expect([...gridPixels(parsed, false)]).toEqual([0, 0, 0, 0, 255, 0, 0, 150, 0, 0, 0, 0]);
  expect([...gridPixels(parsed, true)].slice(8)).toEqual([150, 150, 150, 150]);
  expect(readObstacleGrid({ ...grid, data: [0] })).toBeUndefined();
  const layer = createObstacleLayer(new Scene());
  expect(layer.update(grid, false)).toBe(true);
  const mesh = layer.gridGroup.children[0];
  expect(mesh?.position.x).toBeCloseTo(1.95);
  expect(mesh?.position.y).toBeCloseTo(3.15);
  if (!mesh) throw new Error("メッシュがありません");
  const firstCenter = new Vector3(-1 / 3, 0, 0).multiply(mesh.scale).applyQuaternion(mesh.quaternion).add(mesh.position);
  expect(firstCenter.x).toBeCloseTo(1.95);
  expect(firstCenter.y).toBeCloseTo(3.05);
  layer.dispose();
});
it("状態と前方ゾーンを整形する", () => {
  expect(formatObstacleStatus({ is_stop_zone_occupied: true, is_slow_zone_occupied: false, nearest_distance_m: 1.25 })).toContain("stop: 占有 / slow: 空き / 最近傍: 1.25 m");
  expect(formatObstacleStatus({})).toContain("形式を読めません");
  expect(zonePoints(0.5, 0.8)).toEqual([0, -0.4, 0.02, 0.5, -0.4, 0.02, 0.5, 0.4, 0.02, 0, 0.4, 0.02]);
});
it("表示時だけ購読し、最新の grid を 5 Hz に間引く", () => {
  vi.useFakeTimers();
  const client = new FoxgloveClient({ url: "" });
  const releaseTopic = vi.fn();
  const subscribe = vi.spyOn(client, "subscribeToTopic").mockReturnValue(releaseTopic);
  const store = new TopicStore();
  const form = createControlsForm();
  const layer = createObstacleLayer(new Scene());
  const update = vi.spyOn(layer, "update");
  const release = createObstacleController({ connections: { viewing: client }, topicStore: store } as PanelContext, form, layer, () => {}, () => {});
  form.obstacle.checked = true; form.obstacle.dispatchEvent(new Event("change"));
  expect(subscribe).toHaveBeenCalledTimes(2);
  store.put(topicNames.localGrid, grid, 0n); store.put(topicNames.localGrid, grid, 0n);
  expect(update).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(200);
  expect(update).toHaveBeenCalledTimes(2);
  form.obstacle.checked = false; form.obstacle.dispatchEvent(new Event("change"));
  expect(releaseTopic).toHaveBeenCalledTimes(2);
  store.put(topicNames.localGrid, grid, 0n); vi.advanceTimersByTime(200);
  expect(update).toHaveBeenCalledTimes(2);
  release(); vi.useRealTimers();
});
