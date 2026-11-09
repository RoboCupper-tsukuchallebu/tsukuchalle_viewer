import { Vector3 } from "three";
import { isRecord, isVector } from "./valueGuards.ts";

export function extractPathPoints(value: unknown): { frame: string; points: Vector3[] } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const candidate = "path" in value ? value.path : value;
  if (
    !isRecord(candidate) ||
    !isRecord(candidate.header) ||
    typeof candidate.header.frame_id !== "string" ||
    !Array.isArray(candidate.poses)
  ) {
    return undefined;
  }
  const points: Vector3[] = [];
  for (const poseEntry of candidate.poses) {
    if (!isRecord(poseEntry) || !isRecord(poseEntry.pose) || !isVector(poseEntry.pose.position)) {
      return undefined;
    }
    const position = poseEntry.pose.position;
    points.push(new Vector3(position.x, position.y, position.z));
  }
  return { frame: candidate.header.frame_id, points };
}

import { BufferGeometry, Line, LineBasicMaterial, type Scene } from "three";
import { pathLayers, type PathLayerId } from "./layers.ts";

export function createPathLayer(scene: Scene, report: (key: string, reason: string) => void) {
  const paths = new Map<PathLayerId, { frame: string; line: Line<BufferGeometry, LineBasicMaterial> }>();
  function remove(id: PathLayerId): void {
    const previousLine = paths.get(id);
    if (!previousLine) {
      return;
    }
    scene.remove(previousLine.line);
    previousLine.line.geometry.dispose();
    previousLine.line.material.dispose();
    paths.delete(id);
  }
  return {
    paths,
    update(id: PathLayerId, value: unknown): boolean {
      const extracted = extractPathPoints(value);
      if (!extracted) {
        report(id, `${pathLayers[id].label}: 経路の形式を読めません`);
        return false;
      }
      remove(id);
      const line = new Line(
        new BufferGeometry().setFromPoints(extracted.points),
        new LineBasicMaterial({ color: pathLayers[id].color }),
      );
      paths.set(id, { frame: extracted.frame, line });
      scene.add(line);
      report(id, "");
      return true;
    },
    remove,
  };
}
