// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { Object3D } from "three";
import fixtures from "../fixtures/rosMessages.json";
import { FoxgloveClient } from "../../src/connection/foxgloveClient.ts";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { topicNames } from "../../src/config.ts";
import { DiagnosticsStore } from "../../src/store/diagnosticsStore.ts";
import { TopicStore } from "../../src/store/topicStore.ts";
import { bindClientToTopicStore } from "../../src/store/channelBinding.ts";
import { WriteGate } from "../../src/control/writeGate.ts";
import { mountPanel } from "../../src/panels/3d/index.ts";
import { addOverlay, getRobotPoseInMap } from "../../src/panels/3d/viewApi.ts";

const state = vi.hoisted(() => ({ fail: false }));
vi.mock("three", async (importOriginal) => {
  const original = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    constructor() {
      if (state.fail) {
        throw new Error("WebGL unavailable");
      }
    }
    setSize() {}
    render() {}
    dispose() {}
  }
  return { ...original, WebGLRenderer: FakeRenderer };
});
class FakeWorker {
  onmessage = null;
  onerror = null;
  postMessage() {}
  terminate() {}
}
afterEach(() => {
  vi.unstubAllGlobals();
  state.fail = false;
});

function makeContext() {
  const viewing = new FoxgloveClient({ url: "" });
  const topicStore = new TopicStore();
  return {
    connections: { viewing, writing: null },
    topicStore,
    diagnosticsStore: new DiagnosticsStore(),
    channelBinding: bindClientToTopicStore(viewing, topicStore),
    writeGate: new WriteGate(),
  };
}

it("WebGL が作れない場合に理由を表示する", () => {
  const context = makeContext();
  const container = document.createElement("div");
  state.fail = true;
  const release = mountPanel(container, context);
  expect(container.textContent).toContain("3D を描けません");
  release();
  context.channelBinding.dispose();
});

it("保存済みの静的 TF を読み、オーバーレイを開き直した場面へ付け直す", () => {
  vi.stubGlobal("Worker", FakeWorker);
  const context = makeContext();
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixtures.tfMessage.schema });
  if (!decoder.isDecodable) {
    throw new Error(decoder.reason);
  }
  const value = decoder.decode(Uint8Array.from(Buffer.from(fixtures.tfMessage.hex, "hex")));
  context.topicStore.put(topicNames.staticTransform, value, 0n);
  const container = document.createElement("div");
  const overlay = new Object3D();
  const removeOverlay = addOverlay(overlay);
  const release = mountPanel(container, context);
  expect([...container.querySelectorAll("option")].map((option) => option.value)).toContain("odom");
  expect(getRobotPoseInMap().isAvailable).toBe(true);
  const previousParent = overlay.parent;
  release();
  expect(overlay.parent).toBeNull();
  expect(getRobotPoseInMap().isAvailable).toBe(false);
  const releaseAgain = mountPanel(container, context);
  expect(overlay.parent).not.toBeNull();
  expect(overlay.parent).not.toBe(previousParent);
  releaseAgain();
  removeOverlay();
  context.channelBinding.dispose();
});
