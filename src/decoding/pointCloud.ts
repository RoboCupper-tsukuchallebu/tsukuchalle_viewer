import { writeHeightColor } from "../panels/3d/colors.ts";

export type PointCloudMessage = {
  width: number;
  height: number;
  point_step: number;
  row_step: number;
  is_bigendian: boolean;
  fields: { name: string; offset: number; datatype: number; count: number }[];
  data: Uint8Array;
};

export type ExtractedPointCloud = { points: Float32Array; colors: Float32Array; count: number; minimumZ: number; maximumZ: number };
const float32Datatype = 7;
const float32Bytes = 4;

/** フィールドの配置と行の余白を尊重して、有限な点を等間隔に取り出す。 */
export function extractPointCloud(message: PointCloudMessage, maximumPoints: number): ExtractedPointCloud {
  if (message.is_bigendian) throw new Error("ビッグエンディアンの点群には対応していません");
  if (!Number.isSafeInteger(maximumPoints) || maximumPoints < 1) throw new Error("点数の上限が不正です");
  const offsets = ["x", "y", "z"].map((name) => {
    const field = message.fields.find((candidate) => candidate.name === name);
    if (!field || field.datatype !== float32Datatype || field.count < 1 || field.offset < 0 || field.offset + float32Bytes > message.point_step) {
      throw new Error(`${name} は点の範囲内の float32 である必要があります`);
    }
    return field.offset;
  });
  if (message.row_step < message.width * message.point_step || message.data.byteLength < message.row_step * message.height) {
    throw new Error("点群のデータが不足しています");
  }
  const view = new DataView(message.data.buffer, message.data.byteOffset, message.data.byteLength);
  const total = message.width * message.height;
  const finitePoints = new Float32Array(total * 3);
  let validCount = 0;
  for (let row = 0; row < message.height; row++) {
    for (let column = 0; column < message.width; column++) {
      const start = row * message.row_step + column * message.point_step;
      const x = view.getFloat32(start + (offsets[0] ?? 0), true);
      const y = view.getFloat32(start + (offsets[1] ?? 0), true);
      const z = view.getFloat32(start + (offsets[2] ?? 0), true);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      finitePoints[validCount * 3] = x;
      finitePoints[validCount * 3 + 1] = y;
      finitePoints[validCount * 3 + 2] = z;
      validCount++;
    }
  }
  const count = Math.min(validCount, maximumPoints);
  const points = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let minimumZ = Infinity;
  let maximumZ = -Infinity;
  for (let index = 0; index < count; index++) {
    const source = Math.floor(index * validCount / count) * 3;
    const destination = index * 3;
    points[destination] = finitePoints[source] ?? 0;
    points[destination + 1] = finitePoints[source + 1] ?? 0;
    const z = finitePoints[source + 2] ?? 0;
    points[destination + 2] = z;
    minimumZ = Math.min(minimumZ, z);
    maximumZ = Math.max(maximumZ, z);
  }
  for (let index = 0; index < count; index++) {
    const offset = index * 3;
    writeHeightColor(colors, offset, points[offset + 2] ?? 0, minimumZ, maximumZ);
  }
  return { points, colors, count, minimumZ, maximumZ };
}
