import { describe, expect, it } from "vitest";
import { appendFix, attribution, maximumTrailPoints, nextTileFailures, readFix, statusColor, toMetres } from "../src/panels/map/model.ts";

const origin = { latitude: 0, longitude: 0, status: 0 };

describe("地図の入力と表示", () => {
  it("原点からの緯度経度の差をメートルに変換する", () => {
    const point = { latitude: 0.001, longitude: 0.001, status: 0 };
    const result = toMetres(origin, point);
    expect(result.east).toBeCloseTo(111.195, 2);
    expect(result.north).toBeCloseTo(111.195, 2);
  });
  it("無効な座標と測位失敗を除外する", () => {
    for (const value of [{ latitude: NaN, longitude: 0, status: { status: 0 } }, { latitude: 91, longitude: 0, status: { status: 0 } }, { latitude: 0, longitude: 0, status: { status: -1 } }]) {
      expect(readFix(value)).toBeUndefined();
    }
    expect(readFix({ latitude: 0.001, longitude: 0.001, status: { status: 2 } })).toEqual({ latitude: 0.001, longitude: 0.001, status: 2 });
  });
  it("測位状態ごとに色を区別する", () => {
    expect(new Set([-1, 0, 1, 2].map(statusColor)).size).toBe(4);
  });
  it("軌跡が上限を超えたら古い点を捨てる", () => {
    const trail = Array.from({ length: maximumTrailPoints }, () => origin);
    const next = { ...origin, latitude: 1 };
    expect(appendFix(trail, next)).toHaveLength(maximumTrailPoints);
    expect(appendFix(trail, next).at(-1)).toEqual(next);
  });
  it("タイルの成功で連続失敗をリセットする", () => {
    expect(nextTileFailures(3, false)).toBe(4);
    expect(nextTileFailures(3, true)).toBe(0);
  });
  it("背景に対応した出典を返す", () => {
    expect(attribution("standard").label).toBe("出典: 地理院タイル");
    expect(attribution("photo").label).toBe("出典: 地理院タイル");
    expect(attribution("osm").label).toBe("© OpenStreetMap contributors");
  });
});

it("手組みの CDR をデコードして地図の入力に変換する", async () => {
  // Arrange
  const { createChannelDecoder } = await import("../src/decoding/channelDecoder.ts");
  const { navSatFixBytes, navSatFixSchema } = await import("./fixtures/navSatFix.ts");
  const decoder = createChannelDecoder({ encoding: "cdr", schema: navSatFixSchema, schemaEncoding: "ros2msg" });
  expect(decoder.isDecodable).toBe(true);
  if (!decoder.isDecodable) throw new Error(decoder.reason);
  // Act
  const fix = readFix(decoder.decode(navSatFixBytes));
  // Assert
  expect(fix).toEqual({ latitude: 0.001, longitude: 0.001, status: 2 });
});

it("座標が有効な NO_FIX は灰色で表示し初期値は除外する", () => {
  // Arrange
  const valid = { latitude: 0.001, longitude: 0.001, status: { status: -1 } };
  // Act
  const fix = readFix(valid);
  // Assert
  expect(fix?.status).toBe(-1);
  expect(statusColor(-1)).toBe("#777777");
  expect(readFix({ ...valid, latitude: 0, longitude: 0 })).toBeUndefined();
});
