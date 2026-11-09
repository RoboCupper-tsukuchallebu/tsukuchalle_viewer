import type { Object3D } from "three";
import { frameNames, staleThresholdMs } from "../../config.ts";
import type { TransformLookup, TransformTree } from "./transformTree.ts";

export function setObjectTransform(
  object: Object3D,
  source: string,
  target: string,
  transformTree: TransformTree,
): boolean {
  const transform = transformTree.lookup(source, target);
  object.visible = transform !== undefined;
  if (!transform) {
    return false;
  }
  object.position.copy(transform.translation);
  object.quaternion.copy(transform.rotation);
  return true;
}

export function chooseDisplayFrame(frames: string[], preferredFrame: string): string {
  if (frames.includes(preferredFrame)) {
    return preferredFrame;
  }
  if (frames.includes(frameNames.map)) {
    return frameNames.map;
  }
  return frames[0] ?? frameNames.map;
}

export function isTransformStale(transform: TransformLookup, nowMs: number): boolean {
  return transform.dynamicReceivedAtMs.some(
    (receivedAtMs) => nowMs - receivedAtMs > staleThresholdMs.dynamicTransform,
  );
}
