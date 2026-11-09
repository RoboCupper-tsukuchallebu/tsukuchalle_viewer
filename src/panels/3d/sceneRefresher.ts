import { frameNames } from "../../config.ts";
import type { Object3D } from "three";
import type { CloudLayer } from "./cloudLayer.ts";
import { setObjectTransform } from "./frameTransform.ts";
import { cloudLayers, pathLayers, type CloudLayerId, type PathLayerId } from "./layers.ts";
import { displayedRobotPose, type Odometry } from "./robotPose.ts";
import type { TransformTree } from "./transformTree.ts";

type RefreshInputs = {
  transformTree: TransformTree;
  selectedFrame: string;
  odometry: Odometry | undefined;
  robot: Object3D;
  overlayGroup: Object3D;
  clouds: Map<CloudLayerId, CloudLayer>;
  paths: Map<PathLayerId, { frame: string; line: Object3D }>;
  report: (key: string, reason: string) => void;
};

export function refreshScene(inputs: RefreshInputs): void {
  const { transformTree, selectedFrame, report } = inputs;
  const apply = (object: Object3D, frame: string, key: string, label: string) => {
    const visible = setObjectTransform(object, frame, selectedFrame, transformTree);
    report(key, visible ? "" : `${label}: ${frame} から ${selectedFrame} への TF がありません`);
  };
  for (const [id, layer] of inputs.clouds) {
    if (layer.frame) {
      apply(layer.object, layer.frame, id, cloudLayers[id].label);
    }
  }
  for (const [id, path] of inputs.paths) {
    apply(path.line, path.frame, id, pathLayers[id].label);
  }
  apply(inputs.overlayGroup, frameNames.map, "overlay", "オーバーレイ");
  const pose = displayedRobotPose(transformTree, inputs.odometry, selectedFrame);
  inputs.robot.visible = pose.isAvailable;
  if (pose.isAvailable) {
    inputs.robot.position.copy(pose.position);
    inputs.robot.quaternion.copy(pose.rotation);
  }
  report("robot", pose.isAvailable ? "" : pose.reason);
}
