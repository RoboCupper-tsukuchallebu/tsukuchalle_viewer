import { Quaternion, Vector3 } from "three";
import { frameNames } from "../../config.ts";
import { isTransformStale } from "./frameTransform.ts";
import type { TransformTree, Vector } from "./transformTree.ts";
import { isRecord, isVector, isQuaternion } from "./valueGuards.ts";

export type RobotPoseInMap =
  | { isAvailable: true; x: number; y: number; z: number; yawRadians: number }
  | { isAvailable: false; reason: string };
export type Odometry = {
  header: { frame_id: string };
  pose: { pose: { position: Vector; orientation: Vector & { w: number } } };
};
type DisplayedRobotPose =
  { isAvailable: true; position: Vector3; rotation: Quaternion } | { isAvailable: false; reason: string };

export function robotPoseInMap(transformTree: TransformTree, nowMs: number): RobotPoseInMap {
  const transform = transformTree.lookup(frameNames.robot, frameNames.map);
  if (!transform) {
    return { isAvailable: false, reason: "map → base_link の TF がありません" };
  }
  if (isTransformStale(transform, nowMs)) {
    return { isAvailable: false, reason: "TF が古くなっています" };
  }
  const { x, y, z, w } = transform.rotation;
  return {
    isAvailable: true,
    x: transform.translation.x,
    y: transform.translation.y,
    z: transform.translation.z,
    yawRadians: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  };
}

export function displayedRobotPose(
  transformTree: TransformTree,
  odometry: Odometry | undefined,
  selectedFrame: string,
): DisplayedRobotPose {
  const direct = transformTree.lookup(frameNames.robot, selectedFrame);
  if (direct) {
    return { isAvailable: true, position: direct.translation, rotation: direct.rotation };
  }
  const transform = odometry && transformTree.lookup(odometry.header.frame_id, selectedFrame);
  if (!odometry || !transform) {
    return { isAvailable: false, reason: "ロボットの TF または odom がありません" };
  }
  const pose = odometry.pose.pose;
  const position = new Vector3(pose.position.x, pose.position.y, pose.position.z)
    .applyQuaternion(transform.rotation)
    .add(transform.translation);
  const rotation = transform.rotation
    .clone()
    .multiply(new Quaternion(pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w));
  return { isAvailable: true, position, rotation };
}

export function isOdometry(value: unknown): value is Odometry {
  if (!isRecord(value) || !isRecord(value.header) || !isRecord(value.pose) || !isRecord(value.pose.pose)) {
    return false;
  }
  return (
    typeof value.header.frame_id === "string" &&
    isVector(value.pose.pose.position) &&
    isQuaternion(value.pose.pose.orientation)
  );
}
