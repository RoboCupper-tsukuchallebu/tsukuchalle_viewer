export type CloudLayerId = "pointCloud" | "savedMap" | "velodyne";
export type PathLayerId = "trajectory" | "missionPath";

export const cloudLayers: Record<CloudLayerId, { label: string; limit: "normal" | "map" }> = {
  pointCloud: { label: "点群", limit: "normal" },
  savedMap: { label: "保存地図", limit: "map" },
  velodyne: { label: "velodyne", limit: "normal" },
};
export const pathLayers: Record<PathLayerId, { label: string; color: number }> = {
  trajectory: { label: "軌跡", color: 0x44ddff },
  missionPath: { label: "走行経路", color: 0xffdd44 },
};
