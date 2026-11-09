import { expect, it } from "vitest";
import fixtures from "../fixtures/rosMessages.json";
import { createCdrDecoder } from "../../src/decoding/channelDecoder.ts";
import { TransformTree, type TransformMessage } from "../../src/panels/3d/transformTree.ts";

it("実 CDR の変換を合成し、逆変換と受信時刻を返す", () => {
  const fixture = fixtures.tfMessage;
  const message = createCdrDecoder(fixture.schema)(
    Uint8Array.from(Buffer.from(fixture.hex, "hex")),
  ) as TransformMessage;
  const transformTree = new TransformTree();
  transformTree.update(message, false, 123);
  const forward = transformTree.lookup("base_link", "map");
  const reverse = transformTree.lookup("map", "base_link");
  expect(forward?.translation.x).toBeCloseTo(8);
  expect(forward?.translation.y).toBeCloseTo(-1);
  expect(forward?.translation.z).toBeCloseTo(0.75);
  expect(forward?.rotation.z).toBeCloseTo(Math.SQRT1_2);
  expect(reverse?.translation.x).toBeCloseTo(1);
  expect(reverse?.translation.y).toBeCloseTo(8);
  expect(forward?.dynamicReceivedAtMs).toEqual([123, 123]);
  expect(transformTree.lookup("missing", "map")).toBeUndefined();
  const staticTree = new TransformTree();
  staticTree.update(message, true, 1);
  expect(staticTree.lookup("base_link", "map")?.dynamicReceivedAtMs).toEqual([]);
});
