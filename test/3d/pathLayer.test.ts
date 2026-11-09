import { expect, it } from "vitest";
import fixtures from "../fixtures/rosMessages.json";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { extractPathPoints } from "../../src/panels/3d/pathLayer.ts";

function decode(fixture: { schema: string; hex: string }): unknown {
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixture.schema });
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  return decoder.decode(Uint8Array.from(Buffer.from(fixture.hex, "hex")));
}

it("実バイト列の二種類の経路を読み、不正な形式を拒む", () => {
  expect(extractPathPoints(decode(fixtures.path))?.points.length).toBeGreaterThan(0);
  expect(extractPathPoints(decode(fixtures.pathWithId))?.points.length).toBeGreaterThan(0);
  expect(extractPathPoints({})).toBeUndefined();
});
