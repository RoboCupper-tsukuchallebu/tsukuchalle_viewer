import type { MountPanel } from "../../layout/panelContext.ts";
import { attachClickHandler } from "./clickHandler.ts";
import { attachOverlays, registerRobotPoseProvider } from "./viewApi.ts";
import { createCloudController } from "./cloudController.ts";
import { createControlsForm, type ControlsForm } from "./controlsForm.ts";
import { createFrameSelection } from "./frameSelection.ts";
import { createObstacleLayer } from "./obstacleLayer.ts";
import { createObstacleController } from "./obstacleController.ts";
import { setObjectTransform } from "./frameTransform.ts";
import { createPathLayer } from "./pathLayer.ts";
import { createScene } from "./sceneSetup.ts";
import { createStatusReporter } from "./statusReporter.ts";
import { refreshScene } from "./sceneRefresher.ts";
import { robotPoseInMap, type Odometry } from "./robotPose.ts";
import { subscribeData } from "./dataSubscriptions.ts";
import { subscribeTransforms } from "./transformSubscription.ts";
import { transformTreeFor } from "./transformTree.ts";

function createPanelRoot(container: HTMLElement): {
  root: HTMLElement;
  form: ControlsForm;
  status: HTMLElement;
  canvasHost: HTMLElement;
} {
  const root = document.createElement("section");
  root.className = "panel-3d";
  const form = createControlsForm();
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  const canvasHost = document.createElement("div");
  canvasHost.className = "view-3d-canvas";
  root.append(form.root, status, canvasHost);
  container.append(root);
  return { root, form, status, canvasHost };
}

export const mountPanel: MountPanel = (container, context) => {
  const { root, form, status, canvasHost } = createPanelRoot(container);
  const { frame: select, trajectoryInput } = form;
  const report = createStatusReporter(status);
  const setup = createScene(canvasHost);
  if (!setup.ok) {
    report("webgl", setup.reason);
    return () => {
      root.remove();
    };
  }
  const { scene, camera, renderer, robot, overlayGroup } = setup;
  const detachOverlays = attachOverlays(overlayGroup);
  const transformTree = transformTreeFor(context.topicStore);
  const releasePoseProvider = registerRobotPoseProvider(() => robotPoseInMap(transformTree, Date.now()));
  const releases: (() => void)[] = [];
  let odometry: Odometry | undefined;
  const obstacles = createObstacleLayer(scene);
  const pathLayer = createPathLayer(scene, report);
  const refresh = () => {
    if (form.obstacle.checked) {
      const gridAvailable = obstacles.frame && setObjectTransform(obstacles.gridGroup, obstacles.frame, frameSelection.selectedFrame, transformTree);
      report("obstacleTransform", obstacles.frame && !gridAvailable ? "障害物: grid の TF がありません" : "");
      const zonesAvailable = setObjectTransform(obstacles.zoneGroup, "base_footprint", frameSelection.selectedFrame, transformTree);
      report("obstacleZones", zonesAvailable ? "" : "障害物: base_footprint の TF がありません");
    }
    refreshScene({
      transformTree,
      selectedFrame: frameSelection.selectedFrame,
      odometry,
      robot,
      overlayGroup,
      clouds: clouds.layers,
      paths: pathLayer.paths,
      report,
    });
  };
  const frameSelection = createFrameSelection(select, transformTree, refresh);
  releases.push(createObstacleController(context, form, obstacles, refresh, report));
  obstacles.clear();
  const clouds = createCloudController(scene, context, form, report, refresh);
  releases.push(subscribeTransforms(context, transformTree, report, () => { frameSelection.update(); }));
  frameSelection.update();
  releases.push(
    subscribeData(
      context,
      trajectoryInput,
      pathLayer,
      report,
      (value) => {
        odometry = value;
      },
      refresh,
    ),
  );
  releases.push(
    attachClickHandler(
      renderer.domElement,
      camera,
      transformTree,
      () => frameSelection.selectedFrame,
      report,
    ),
  );
  const stopRendering = setup.startRendering();
  return () => {
    stopRendering();
    releases.forEach((release) => {
      release();
    });
    clouds.dispose();
    detachOverlays();
    releasePoseProvider();
    setup.dispose();
    root.remove();
  };
};
