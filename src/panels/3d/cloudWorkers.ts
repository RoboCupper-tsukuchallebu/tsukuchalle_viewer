import type { Scene } from "three";
import { pointCloudLimits } from "../../config.ts";
import { CloudLayer } from "./cloudLayer.ts";
import type { ControlsForm } from "./controlsForm.ts";
import { LatestWorker } from "./latestWorker.ts";
import { cloudLayers, type CloudLayerId } from "./layers.ts";

export function createCloudWorkers(
  scene: Scene,
  form: ControlsForm,
  report: (key: string, reason: string) => void,
  refresh: () => void,
): {
  layers: Map<CloudLayerId, CloudLayer>;
  workers: Map<CloudLayerId, LatestWorker>;
  startWorker: (id: CloudLayerId, layer: CloudLayer) => void;
  dispose: () => void;
} {
  const layers = new Map<CloudLayerId, CloudLayer>();
  const workers = new Map<CloudLayerId, LatestWorker>();
  function startWorker(id: CloudLayerId, layer: CloudLayer): void {
    workers.get(id)?.dispose();
    try {
      const worker = new LatestWorker(
        new Worker(new URL("../../decoding/worker.ts", import.meta.url), { type: "module" }),
        (response) => {
          if (id === "velodyne" && !form.velodyne.checked) {
            return;
          }
          if ("error" in response) {
            report(id, `${cloudLayers[id].label}: ${response.error}`);
            return;
          }
          report(id, "");
          layer.update(response.result, response.frame);
          refresh();
        },
        (message) => {
          report(id, `${cloudLayers[id].label}: Worker の失敗: ${message}`);
        },
      );
      workers.set(id, worker);
    } catch (error) {
      report(id, `${cloudLayers[id].label}: Worker を作れません: ${String(error)}`);
    }
  }
  for (const id of ["pointCloud", "savedMap", "velodyne"] as const) {
    const capacity =
      id === "savedMap" ? pointCloudLimits.savedMapMaximumPoints : pointCloudLimits.defaultMaximumPoints;
    const layer = new CloudLayer(capacity);
    layers.set(id, layer);
    scene.add(layer.object);
    startWorker(id, layer);
  }
  return {
    layers,
    workers,
    startWorker,
    dispose() {
      workers.forEach((worker) => {
        worker.dispose();
      });
      layers.forEach((layer) => {
        layer.dispose();
      });
    },
  };
}
