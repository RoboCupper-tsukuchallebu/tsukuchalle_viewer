import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/rosMessages.json";
import { createChannelDecoder } from "../../src/decoding/channelDecoder.ts";
import { extractPointCloud, type PointCloudMessage } from "../../src/decoding/pointCloud.ts";

function decode(fixture: { schema: string; hex: string }): PointCloudMessage {
  const decoder = createChannelDecoder({ encoding: "cdr", schema: fixture.schema });
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  return decoder.decode(Uint8Array.from(Buffer.from(fixture.hex, "hex"))) as PointCloudMessage;
}

describe("点群の取り出し", () => {
  it("実際の CDR から有限な点だけを取り出す", () => {
    const result = extractPointCloud(decode(fixtures.pointCloudXyz), 10);
    expect(result.count).toBe(3);
    expect(Array.from(result.points.slice(0, 3))).toEqual([1, 2, 3]);
  });
  it("フィールドの順序と行の配置に従う", () => {
    expect(extractPointCloud(decode(fixtures.pointCloudReorderedFields), 10).count).toBeGreaterThan(0);
    expect(extractPointCloud(decode(fixtures.pointCloudVelodyneLike), 2).count).toBeLessThanOrEqual(2);
  });
  it("ビッグエンディアンを拒否する", () => {
    expect(() => extractPointCloud(decode(fixtures.pointCloudBigEndian), 10)).toThrow();
  });
  it("有限点を等間隔に間引き、最初の点を含む", () => {
    const message = decode(fixtures.pointCloudXyz);
    const result = extractPointCloud(message, 2);
    expect(result.count).toBe(2);
    expect([...result.points.slice(0, 3)]).toEqual([1, 2, 3]);
    expect([...result.colors.slice(0, 3)]).toEqual([1, 0, 0]);
    expect([...result.colors.slice(3, 6)]).toEqual([0, 0, 1]);
  });
  it("organized 点群の無効点を除く", () => {
    const message = decode(fixtures.pointCloudVelodyneLike);
    const result = extractPointCloud(message, 10);
    expect(result.count).toBe(4);
  });
  it("float32 以外の座標と不足したデータを拒む", () => {
    const message = decode(fixtures.pointCloudXyz);
    const fields = message.fields.map((field) => field.name === "x" ? { ...field, datatype: 1 } : field);
    expect(() => extractPointCloud({ ...message, fields }, 10)).toThrow();
    expect(() => extractPointCloud({ ...message, data: message.data.slice(0, 1) }, 10)).toThrow();
  });

});
