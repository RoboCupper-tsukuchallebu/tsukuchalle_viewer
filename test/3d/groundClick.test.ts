import { expect, it } from "vitest";
import fixtures from "../fixtures/rosMessages.json";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { TransformTree, type TransformMessage } from "../../src/panels/3d/transformTree.ts";
import { groundClick } from "../../src/panels/3d/groundClick.ts";

it("odom の光線を map の座標へ変える", () => {
  const fixture = fixtures.tfMessage;
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixture.schema });
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  const tree = new TransformTree();
  tree.update(
    decoder.decode(Uint8Array.from(Buffer.from(fixture.hex, "hex"))) as TransformMessage,
    false,
    1000,
  );
  const result = groundClick(
    { origin: { x: 0, y: 0, z: 2 }, direction: { x: 1, y: 0, z: -1 } },
    "odom",
    tree,
    1000,
  );
  expect(result.isPlaceable).toBe(true);
  if (result.isPlaceable) {
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(-0.25);
  }
});

it("TF が無いと置けない", () => {
  expect(
    groundClick(
      { origin: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } },
      "map",
      new TransformTree(),
      0,
    ).isPlaceable,
  ).toBe(false);
});

it("動的 TF は受信時刻で古さを判定し、静的 TF は古くても使える", () => {
  const fixture = fixtures.tfMessage;
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixture.schema });
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  const message = decoder.decode(Uint8Array.from(Buffer.from(fixture.hex, "hex"))) as TransformMessage;
  const ray = { origin: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } };
  const dynamicTree = new TransformTree();
  const staticTree = new TransformTree();
  dynamicTree.update(message, false, 0);
  staticTree.update(message, true, 0);
  expect(groundClick(ray, "odom", dynamicTree, 1001).isPlaceable).toBe(false);
  expect(groundClick(ray, "odom", staticTree, 1001).isPlaceable).toBe(true);
});

it("表示側とロボット側の動的 TF の古さをそれぞれ判定する", () => {
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixtures.tfMessage.schema });
  if (!decoder.isDecodable) {
    throw new Error(decoder.reason);
  }
  const message = decoder.decode(
    Uint8Array.from(Buffer.from(fixtures.tfMessage.hex, "hex")),
  ) as TransformMessage;
  const first = message.transforms[0];
  const second = message.transforms[1];
  if (!first || !second) {
    throw new Error("TF が不足しています");
  }
  const displayBranch = { ...second, child_frame_id: "display" };
  const ray = { origin: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } };
  const displayStale = new TransformTree();
  displayStale.update({ transforms: [first] }, true, 0);
  displayStale.update({ transforms: [second] }, false, 1001);
  displayStale.update({ transforms: [displayBranch] }, false, 0);
  const robotStale = new TransformTree();
  robotStale.update({ transforms: [first] }, true, 0);
  robotStale.update({ transforms: [second] }, false, 0);
  robotStale.update({ transforms: [displayBranch] }, false, 1001);
  expect(groundClick(ray, "display", displayStale, 1001)).toEqual({
    isPlaceable: false,
    reason: "TF が古くなっています",
  });
  expect(groundClick(ray, "display", robotStale, 1001)).toEqual({
    isPlaceable: false,
    reason: "TF が古くなっています",
  });
});

it("地面と平行な光線と地面が後方にある光線を拒む", () => {
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixtures.tfMessage.schema });
  if (!decoder.isDecodable) {
    throw new Error(decoder.reason);
  }
  const message = decoder.decode(
    Uint8Array.from(Buffer.from(fixtures.tfMessage.hex, "hex")),
  ) as TransformMessage;
  const transformTree = new TransformTree();
  transformTree.update(message, true, 0);
  const origin = { x: 0, y: 0, z: 2 };
  expect(groundClick({ origin, direction: { x: 1, y: 0, z: 0 } }, "map", transformTree, 0).isPlaceable).toBe(
    false,
  );
  expect(groundClick({ origin, direction: { x: 0, y: 0, z: 1 } }, "map", transformTree, 0).isPlaceable).toBe(
    false,
  );
  expect(groundClick({ origin, direction: { x: 1, y: 0, z: -1 } }, "map", transformTree, 0)).toEqual({
    isPlaceable: true,
    x: 1.25,
    y: 0,
  });
});
