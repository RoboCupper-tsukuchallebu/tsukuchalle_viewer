import type { PanelContext } from "../layout/panelContext.ts";
import { robotPoseInMap } from "../panels/3d/robotPose.ts";
import { subscribeTransforms } from "../panels/3d/transformSubscription.ts";
import { transformTreeFor } from "../panels/3d/transformTree.ts";
import { registerRobotPoseProvider } from "../panels/3d/viewApi.ts";

/** TF の購読と姿勢の提供を、タブの切り替えに依存させない。 */
export function startTransformStore(context: PanelContext): () => void {
  const tree = transformTreeFor(context.topicStore);
  const releaseSubscription = subscribeTransforms(context, tree, () => {}, () => {});
  const releaseProvider = registerRobotPoseProvider(() => robotPoseInMap(tree, Date.now()));
  return () => {
    releaseSubscription();
    releaseProvider();
  };
}
