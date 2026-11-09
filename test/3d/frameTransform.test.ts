import { expect, it } from "vitest";
import { Object3D } from "three";
import fixtures from "../fixtures/rosMessages.json";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { TransformTree, type TransformMessage } from "../../src/panels/3d/transformTree.ts";
import { setObjectTransform } from "../../src/panels/3d/frameTransform.ts";

function decode(fixture: { schema: string; hex: string }): unknown {
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixture.schema });
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  return decoder.decode(Uint8Array.from(Buffer.from(fixture.hex, "hex")));
}

it("map のオーバーレイを表示フレームへ変換し、TF が無ければ隠す", () => {
  const tree = new TransformTree();
  tree.update(decode(fixtures.tfMessage) as TransformMessage, true, 0);
  const object = new Object3D();
  expect(setObjectTransform(object, "map", "odom", tree)).toBe(true);
  expect(object.position.x).toBeCloseTo(2);
  expect(object.position.y).toBeCloseTo(10);
  expect(object.position.z).toBeCloseTo(-0.5);
  expect(object.quaternion.z).toBeCloseTo(-Math.SQRT1_2);
  expect(setObjectTransform(object, "map", "map", tree)).toBe(true);
  expect(object.position.length()).toBe(0);
  expect(setObjectTransform(object, "map", "missing", tree)).toBe(false);
  expect(object.visible).toBe(false);
});
