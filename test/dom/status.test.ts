// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createCdrEncoder } from "../../src/decoding/channelDecoder.ts";
import { topicNames } from "../../src/config.ts";
import { FoxgloveClient } from "../../src/connection/foxgloveClient.ts";
import { WriteGate } from "../../src/control/writeGate.ts";
import { mountPanel } from "../../src/panels/status/index.ts";
import { isStale, localizationSummary } from "../../src/panels/status/statusData.ts";
import { startTopBarStatus } from "../../src/panels/status/topBarStatus.ts";
import { createTopBar } from "../../src/layout/topBar.ts";
import { bindClientToTopicStore } from "../../src/store/channelBinding.ts";
import { DiagnosticsStore } from "../../src/store/diagnosticsStore.ts";
import { TopicStore } from "../../src/store/topicStore.ts";

class TestClient extends FoxgloveClient {
  notifyChannels(): void { this.emit("channelsChanged", this.channels); }
  sendMessage(channelId: number, topic: string, payload: Uint8Array): void {
    this.emit("message", { channelId, topic, payload, logTimeNanoseconds: 0n });
  }
}

function setup() {
  const viewing = new TestClient({ url: "ws://example.invalid" });
  const connections = { viewing, writing: null };
  const topicStore = new TopicStore();
  const diagnosticsStore = new DiagnosticsStore();
  const channelBinding = bindClientToTopicStore(viewing, topicStore);
  const writeGate = new WriteGate();
  return { connections, topicStore, diagnosticsStore, channelBinding, writeGate };
}

const dependencies = `
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
`;
function schema(name: string): string {
  return readFileSync(`test/fixtures/status/${name}.msg`, "utf8") + dependencies;
}

test("実物の障害物定義の CDR が手組みのバイト列と一致する", () => {
  const encode = createCdrEncoder(schema("ObstacleStatus"));
  const bytes = encode({ header: { stamp: { sec: 1, nanosec: 2 }, frame_id: "a" }, is_stop_zone_occupied: true, is_slow_zone_occupied: false, is_input_stale: true, stale_sources: ["x"], stop_zone_cell_count: 3, slow_zone_cell_count: 4, nearest_distance_m: Infinity, processing_time_ms: 1 });
  expect([...bytes]).toEqual([0,1,0,0, 1,0,0,0, 2,0,0,0, 2,0,0,0, 97,0, 1,0,1,0,0,0, 1,0,0,0, 2,0,0,0, 120,0,0,0, 3,0,0,0, 4,0,0,0, 0,0,128,127, 0,0,128,63]);
});

test("実物の自己位置定義をチャネル経由で表示し、将来のフィールドも表示する", () => {
  const context = setup();
  const container = document.createElement("div");
  const stopPanel = mountPanel(container, context);
  const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });
  const stop = startTopBarStatus({ ...context, viewing: context.connections.viewing, topBar });
  const definition = schema("LocalizationStatus").replace("string last_error", "string last_error\nstring future_field");
  const channel = { id: 1, topic: topicNames.localizationStatus, encoding: "cdr", schemaName: "lightnav_msgs/msg/LocalizationStatus", schema: definition };
  (context.connections.viewing.channels as Map<number, typeof channel>).set(1, channel);
  context.connections.viewing.notifyChannels();
  const bytes = createCdrEncoder(definition)({ header: { stamp: { sec: 12, nanosec: 34 }, frame_id: "map" }, state: 1, mode: 0, is_large_correction: false, is_gps_conflict: false, pending_correction_m: 0, last_inlier_ratio: 0.5, last_lidar_odom_inlier_ratio: 0, seconds_since_last_match: 0, odom_only_distance_m: 0, gps_status: 2, gps_std_m: 0, last_scan_time_ms: 0, last_match_time_ms: 0, position_std_m: [1, 2, 3], last_error: "", future_field: "future value" });
  context.connections.viewing.sendMessage(1, topicNames.localizationStatus, bytes);
  expect(container.textContent).toContain("TRACKING (1)");
  expect(container.textContent).toContain("MODE_LOCALIZATION (0)");
  expect(container.textContent).toContain("stamp: 12 秒 34 ナノ秒 / frame_id: map");
  expect(container.textContent).toContain("[1,2,3]");
  expect(container.textContent).toContain("future value");
  expect(topBar.localizationStatusSlot.textContent).toContain("inlier: 0.5");
  stop(); stopPanel(); topBar.dispose();
});

test("実物の走行と障害物の値を読みやすく表示する", () => {
  const context = setup();
  const container = document.createElement("div");
  const stop = mountPanel(container, context);
  for (const [id, topic, name, value] of [
    [2, topicNames.followStatus, "FollowStatus", { header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" }, state: 4, active_layer: 1, session_id: 1, path_id: 2, closest_index: 3, remaining_distance_m: 0, path_deviation_m: 0, commanded_linear_mps: 0, is_stuck: false }],
    [3, topicNames.obstacleStatus, "ObstacleStatus", { header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" }, is_stop_zone_occupied: false, is_slow_zone_occupied: false, is_input_stale: true, stale_sources: ["points", "scan"], stop_zone_cell_count: 0, slow_zone_cell_count: 0, nearest_distance_m: Infinity, processing_time_ms: 0 }],
  ] as const) {
    const definition = schema(name);
    const channel = { id, topic, encoding: "cdr", schemaName: name, schema: definition };
    (context.connections.viewing.channels as Map<number, typeof channel>).set(id, channel);
    context.connections.viewing.sendMessage(id, topic, createCdrEncoder(definition)(value));
  }
  expect(container.textContent).toContain("BLOCKED (4)");
  expect(container.textContent).toContain("LAYER_AVOID (1)");
  expect(container.textContent).toContain('["points","scan"]');
  expect(container.textContent).toContain("なし");
  stop();
});

test("受信時刻から古さを判定し、危険な状態を文字で示す", () => {
  // Arrange
  const entry = { topic: "status", value: { state: 4 }, receivedAtMs: 1000, logTimeNanoseconds: 0n };
  // Act・Assert
  expect(isStale(entry, 6000)).toBe(false);
  expect(isStale(entry, 6001)).toBe(true);
  vi.spyOn(Date, "now").mockReturnValue(1000);
  expect(localizationSummary(entry).text).toContain("危険");
  vi.restoreAllMocks();
});

test("diagnostics を名前でまとめ、未知の key と不正な値を扱う", () => {
  // Arrange
  const context = setup();
  const container = document.createElement("div");
  const stop = mountPanel(container, context);
  // Act
  context.diagnosticsStore.update({ status: [null, { name: "localization", level: 1, values: [null, { key: "new_key", value: "new_value" }] }, { name: "localization", level: 2, values: [{ key: "new_key", value: "new_value" }] }] }, Date.now());
  // Assert
  expect(container.textContent).toContain("localization — ERROR");
  expect(container.textContent).toContain("new_key");
  expect(container.textContent).toContain("new_value");
  expect(context.diagnosticsStore.all()).toHaveLength(1);
  stop();
});

test("スキーマの無い型を表示し購読しない", () => {
  // Arrange
  const context = setup();
  const container = document.createElement("div");
  const stop = mountPanel(container, context);
  // Act
  const channel = { id: 1, topic: topicNames.localizationStatus, encoding: "cdr", schemaName: "lightnav_msgs/msg/LocalizationStatus", schema: "" };
  (context.connections.viewing.channels as Map<number, typeof channel>).set(1, channel);
  context.connections.viewing.notifyChannels();
  // Assert
  expect(container.textContent).toContain("型が bridge に無い（lightnav_msgs 未導入）");
  expect(context.connections.viewing.isSubscribedToTopic(topicNames.localizationStatus)).toBe(false);
  stop();
});
