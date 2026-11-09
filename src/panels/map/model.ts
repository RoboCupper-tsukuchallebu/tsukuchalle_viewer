export type Fix = { latitude: number; longitude: number; status: number };
export type Metres = { east: number; north: number };
export const maximumTrailPoints = 1000;
export const tileFailureLimit = 4;
const earthRadiusMetres = 6371000;
const degreesToRadians = Math.PI / 180;

export function readFix(value: unknown): Fix | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const statusRecord = record["status"];
  if (typeof statusRecord !== "object" || statusRecord === null) return undefined;
  const status = (statusRecord as Record<string, unknown>)["status"];
  const latitude = record["latitude"];
  const longitude = record["longitude"];
  if (typeof status !== "number" || ![-1, 0, 1, 2].includes(status)) return undefined;
  if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  if (status === -1 && latitude === 0 && longitude === 0) return undefined;
  return { latitude, longitude, status };
}

export function toMetres(origin: Fix, point: Fix): Metres {
  return {
    east: (point.longitude - origin.longitude) * degreesToRadians * earthRadiusMetres * Math.cos(origin.latitude * degreesToRadians),
    north: (point.latitude - origin.latitude) * degreesToRadians * earthRadiusMetres,
  };
}

export const statusLegend = [
  { status: -1, label: "NO_FIX", color: "#777777" },
  { status: 0, label: "FIX", color: "#d14900" },
  { status: 1, label: "SBAS", color: "#0068b5" },
  { status: 2, label: "GBAS", color: "#14823b" },
] as const;

export function statusColor(status: number): string {
  return statusLegend.find((item) => item.status === status)?.color ?? "#777777";
}

export function appendFix(trail: readonly Fix[], fix: Fix): Fix[] {
  return [...trail, fix].slice(-maximumTrailPoints);
}

export function nextTileFailures(previous: number, succeeded: boolean): number {
  return succeeded ? 0 : previous + 1;
}

export function attribution(layer: string): { label: string; url: string } {
  return layer === "osm"
    ? { label: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" }
    : { label: "出典: 地理院タイル", url: "https://maps.gsi.go.jp/development/ichiran.html" };
}
