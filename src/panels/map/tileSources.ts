import { mapTiles } from "../../config.ts";

export type TileSource = "standard" | "photo" | "osm";

export const tileSources = {
  standard: { label: "標準地図", url: mapTiles.standardUrlTemplate },
  photo: { label: "写真", url: mapTiles.photoUrlTemplate },
  osm: { label: "OpenStreetMap", url: mapTiles.osmUrlTemplate },
} as const;

export function isTileSource(value: string): value is TileSource {
  return value === "standard" || value === "photo" || value === "osm";
}
