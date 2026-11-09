import { Vector3 } from "three";
import { frameNames } from "../../config.ts";
import { isTransformStale } from "./frameTransform.ts";
import type { TransformTree, Vector } from "./transformTree.ts";

export type GroundClickResult =
  { isPlaceable: true; x: number; y: number } | { isPlaceable: false; reason: string };

/** 表示フレームの光線を map のロボットの高さの平面に交差させる。 */
export function groundClick(
  ray: { origin: Vector; direction: Vector },
  frame: string,
  transformTree: TransformTree,
  nowMs: number,
): GroundClickResult {
  const displayToMap = transformTree.lookup(frame, frameNames.map);
  const robotToMap = transformTree.lookup(frameNames.robot, frameNames.map);
  if (!displayToMap || !robotToMap) {
    return { isPlaceable: false, reason: "必要な TF がありません" };
  }
  if (isTransformStale(displayToMap, nowMs) || isTransformStale(robotToMap, nowMs)) {
    return { isPlaceable: false, reason: "TF が古くなっています" };
  }
  const origin = new Vector3(ray.origin.x, ray.origin.y, ray.origin.z)
    .applyQuaternion(displayToMap.rotation)
    .add(displayToMap.translation);
  const direction = new Vector3(ray.direction.x, ray.direction.y, ray.direction.z).applyQuaternion(
    displayToMap.rotation,
  );
  const parallelTolerance = 1e-10;
  if (Math.abs(direction.z) < parallelTolerance) {
    return { isPlaceable: false, reason: "地面と平行です" };
  }
  const distance = (robotToMap.translation.z - origin.z) / direction.z;
  if (distance < 0) {
    return { isPlaceable: false, reason: "地面が視線の後方にあります" };
  }
  const intersection = origin.addScaledVector(direction, distance);
  return { isPlaceable: true, x: intersection.x, y: intersection.y };
}
