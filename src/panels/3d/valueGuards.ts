export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isVector(value: unknown): value is { x: number; y: number; z: number } {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.z === "number" &&
    [value.x, value.y, value.z].every(Number.isFinite)
  );
}

export function isQuaternion(value: unknown): value is { x: number; y: number; z: number; w: number } {
  return isVector(value) && "w" in value && typeof value.w === "number" && Number.isFinite(value.w);
}
