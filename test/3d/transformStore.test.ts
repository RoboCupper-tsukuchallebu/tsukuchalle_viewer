import { expect, test } from "vitest";
import { FoxgloveClient } from "../../src/connection/foxgloveClient.ts";
import { WriteGate } from "../../src/control/writeGate.ts";
import { topicNames } from "../../src/config.ts";
import { getRobotPoseInMap } from "../../src/panels/3d/viewApi.ts";
import { bindClientToTopicStore } from "../../src/store/channelBinding.ts";
import { DiagnosticsStore } from "../../src/store/diagnosticsStore.ts";
import { TopicStore } from "../../src/store/topicStore.ts";
import { startTransformStore } from "../../src/store/transformStore.ts";

test("3D パネルを開かずに TF を購読し、map の姿勢を参照できる", () => {
  const viewing = new FoxgloveClient({ url: "" });
  const topicStore = new TopicStore();
  const channelBinding = bindClientToTopicStore(viewing, topicStore);
  const release = startTransformStore({
    connections: { viewing, writing: null }, topicStore, channelBinding,
    diagnosticsStore: new DiagnosticsStore(), writeGate: new WriteGate(),
  });
  expect(viewing.isSubscribedToTopic(topicNames.transform)).toBe(true);
  topicStore.put(topicNames.transform, { transforms: [{
    header: { frame_id: "map" }, child_frame_id: "base_link",
    transform: { translation: { x: 1, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
  }] }, 0n);
  expect(getRobotPoseInMap()).toMatchObject({ isAvailable: true, x: 1, y: 2 });
  release();
  expect(viewing.isSubscribedToTopic(topicNames.transform)).toBe(false);
  channelBinding.dispose();
});
