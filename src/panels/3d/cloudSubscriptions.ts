import { defaultPointCloud, topicNames } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import type { CloudLayer } from "./cloudLayer.ts";
import type { ControlsForm } from "./controlsForm.ts";
import type { CloudLayerId } from "./layers.ts";

export function bindCloudSubscriptions(
  context: PanelContext,
  form: ControlsForm,
  layers: Map<CloudLayerId, CloudLayer>,
  startWorker: (id: CloudLayerId, layer: CloudLayer) => void,
): () => void {
  const client = context.connections.viewing;
  let releaseMap = client.subscribeToTopic(form.mapInput.value);
  form.mapInput.onchange = () => {
    releaseMap();
    releaseMap = client.subscribeToTopic(form.mapInput.value);
    const layer = layers.get("savedMap");
    if (layer) {
      layer.object.visible = false;
      layer.frame = "";
      startWorker("savedMap", layer);
    }
  };
  let releaseVelodyne: (() => void) | undefined;
  form.velodyne.onchange = () => {
    releaseVelodyne?.();
    releaseVelodyne = form.velodyne.checked ? client.subscribeToTopic(topicNames.velodynePoints) : undefined;
    const layer = layers.get("velodyne");
    if (layer && !form.velodyne.checked) {
      layer.object.visible = false;
      layer.frame = "";
    }
  };
  const releaseDefault = client.subscribeToTopic(defaultPointCloud);
  return () => {
    releaseMap();
    releaseVelodyne?.();
    releaseDefault();
  };
}
