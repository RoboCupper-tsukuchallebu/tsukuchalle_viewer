import { topicNames } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import type { PathLayerId } from "./layers.ts";
import { missionPathReason } from "./missionPathStatus.ts";
import type { createPathLayer } from "./pathLayer.ts";
import { isOdometry, type Odometry } from "./robotPose.ts";

export function subscribeData(
  context: PanelContext,
  trajectoryInput: HTMLInputElement,
  pathLayer: ReturnType<typeof createPathLayer>,
  report: (key: string, reason: string) => void,
  onOdometry: (odometry: Odometry) => void,
  refresh: () => void,
): () => void {
  const client = context.connections.viewing;
  const releases = [client.subscribeToTopic(topicNames.localizationOdometry)];
  releases.push(
    context.topicStore.subscribe(topicNames.localizationOdometry, (entry) => {
      if (!isOdometry(entry.value)) {
        report("odometry", "odom の形式を読めません");
        return;
      }
      report("odometry", "");
      onOdometry(entry.value);
      refresh();
    }),
  );
  function subscribePath(topic: string, id: PathLayerId): () => void {
    const release = client.subscribeToTopic(topic);
    const stopSubscription = context.topicStore.subscribe(topic, (entry) => {
      if (pathLayer.update(id, entry.value)) {
        refresh();
      }
    });
    return () => {
      release();
      stopSubscription();
      pathLayer.remove(id);
    };
  }
  let releaseTrajectory = subscribePath(trajectoryInput.value, "trajectory");
  trajectoryInput.onchange = () => {
    releaseTrajectory();
    releaseTrajectory = subscribePath(trajectoryInput.value, "trajectory");
  };
  releases.push(subscribePath(topicNames.missionPath, "missionPath"));
  const checkMission = () => {
    report("mission", missionPathReason(context));
  };
  releases.push(client.on("channelsChanged", checkMission));
  releases.push(
    client.on("message", (message) => {
      if (message.topic === topicNames.missionPath) {
        checkMission();
      }
    }),
  );
  checkMission();
  return () => {
    releases.forEach((release) => {
      release();
    });
    releaseTrajectory();
  };
}
