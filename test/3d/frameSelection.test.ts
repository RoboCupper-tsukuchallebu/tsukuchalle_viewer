// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import fixtures from "../fixtures/rosMessages.json";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { storageKeys } from "../../src/config.ts";
import { createFrameSelection } from "../../src/panels/3d/frameSelection.ts";
import { isTransformMessage, TransformTree } from "../../src/panels/3d/transformTree.ts";

it("保存したフレームが後から届くと復元し、一覧が同じなら選択肢を再作成しない", () => {
  localStorage.setItem(storageKeys.selected3dFrame, "base_link");
  const select = document.createElement("select");
  const transformTree = new TransformTree();
  const selection = createFrameSelection(select, transformTree, vi.fn());
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixtures.tfMessage.schema });
  if (!decoder.isDecodable) {
    throw new Error(decoder.reason);
  }
  const message = decoder.decode(Uint8Array.from(Buffer.from(fixtures.tfMessage.hex, "hex")));
  if (!isTransformMessage(message)) {
    throw new Error("TF の形式が不正です");
  }
  transformTree.update({ transforms: message.transforms.slice(0, 1) }, true, 0);
  selection.update();
  expect(select.value).toBe("map");
  expect(localStorage.getItem(storageKeys.selected3dFrame)).toBe("base_link");
  transformTree.update(message, true, 0);
  selection.update();
  expect(select.value).toBe("base_link");
  const firstOption = select.options[0];
  selection.update();
  expect(select.options[0]).toBe(firstOption);
  select.value = "odom";
  select.dispatchEvent(new Event("change"));
  expect(localStorage.getItem(storageKeys.selected3dFrame)).toBe("odom");
  localStorage.clear();
});
