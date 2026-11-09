import type { Scene } from "three";
import { defaultPointCloud, pointCloudLimits, topicNames } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import type { CloudLayer } from "./cloudLayer.ts";
import { clampMaximumPoints, type ControlsForm } from "./controlsForm.ts";
import { createCloudWorkers } from "./cloudWorkers.ts";
import { bindCloudSubscriptions } from "./cloudSubscriptions.ts";
import { type CloudLayerId } from "./layers.ts";

export function topicToCloudLayerId(
  topic: string,
  mapTopic: string,
  velodyneEnabled: boolean,
): CloudLayerId | undefined {
  if (topic === defaultPointCloud) {
    return "pointCloud";
  }
  if (topic === mapTopic) {
    return "savedMap";
  }
  if (topic === topicNames.velodynePoints && velodyneEnabled) {
    return "velodyne";
  }
  return undefined;
}

export function createCloudController(
  scene: Scene,
  context: PanelContext,
  form: ControlsForm,
  report: (key: string, reason: string) => void,
  refresh: () => void,
): { layers: Map<CloudLayerId, CloudLayer>; dispose: () => void } {
  const { layers, workers, startWorker, dispose } = createCloudWorkers(scene, form, report, refresh);
  const releaseSubscriptions = bindCloudSubscriptions(context, form, layers, startWorker);
  const client = context.connections.viewing;
  const releaseMessages = client.on("message", (message) => {
    const channel = client.channels.get(message.channelId);
    if (!channel || channel.schemaName !== "sensor_msgs/msg/PointCloud2") {
      return;
    }
    const id = topicToCloudLayerId(message.topic, form.mapInput.value, form.velodyne.checked);
    if (!id) {
      return;
    }
    const fallback =
      id === "savedMap" ? pointCloudLimits.savedMapMaximumPoints : pointCloudLimits.defaultMaximumPoints;
    const text = id === "savedMap" ? form.mapLimit.value : form.limit.value;
    const maximumPoints = clampMaximumPoints(text, fallback, pointCloudLimits.savedMapMaximumPoints);
    workers.get(id)?.submit({ channel, payload: message.payload, maximumPoints });
  });
  return {
    layers,
    dispose() {
      releaseSubscriptions();
      releaseMessages();
      dispose();
    },
  };
}
