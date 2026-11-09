/** 高さを青から赤へ変換し、既存の配列に書き込む。 */
export function writeHeightColor(
  target: Float32Array,
  offset: number,
  z: number,
  minimum: number,
  maximum: number,
): void {
  const ratio = maximum > minimum ? Math.max(0, Math.min(1, (z - minimum) / (maximum - minimum))) : 0.5;
  target[offset] = ratio;
  target[offset + 1] = 1 - Math.abs(2 * ratio - 1);
  target[offset + 2] = 1 - ratio;
}
