import { AxesHelper, BoxGeometry, Color, GridHelper, Group, Line, LineBasicMaterial, BufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { defaultPointCloud, frameNames, pointCloudLimits, storageKeys, topicNames } from "../../config.ts";
import { readStoredText, writeStoredText } from "../../layout/safeStorage.ts";
import type { MountPanel } from "../../layout/panelContext.ts";
import { createStatusReporter } from "./statusReporter.ts";
import { CloudLayer } from "./cloudLayer.ts";
import { groundClick } from "./groundClick.ts";
import { LatestWorker } from "./latestWorker.ts";
import { TransformTree, type TransformMessage } from "./transformTree.ts";
import { attachOverlays, notifyGroundClick } from "./viewApi.ts";
import type { PointCloudResponse } from "../../decoding/worker.ts";

const clickTolerance = 5;
type Pose = { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
type Path = { header: { frame_id: string }; poses: { pose: Pose }[] };
type Odometry = { header: { frame_id: string }; pose: { pose: Pose } };

export const mountPanel: MountPanel = (container, context) => {
  const root = document.createElement("section"); root.className = "panel-3d";
  root.innerHTML = `<div class="view-3d-controls"><label>表示フレーム <select data-frame><option>map</option></select></label><label>点数の上限 <input data-limit type="number" min="1" max="2000000" value="${pointCloudLimits.defaultMaximumPoints}"></label><label>地図の点数の上限 <input data-map-limit type="number" min="1" max="2000000" value="${pointCloudLimits.savedMapMaximumPoints}"></label><label><input data-velodyne type="checkbox"> velodyne を表示</label><span>約 1.5 MB × 10 Hz。細い回線では遅れることがあります。</span><label>保存地図 <input data-map value="${topicNames.savedMap}"></label><label>軌跡 <input data-trajectory value="${topicNames.savedTrajectory}"></label></div><div data-status role="status"></div><div class="view-3d-canvas"></div>`;
  container.append(root);
  const select = root.querySelector<HTMLSelectElement>('[data-frame]');
  const limit = root.querySelector<HTMLInputElement>('[data-limit]');
  const mapLimit = root.querySelector<HTMLInputElement>('[data-map-limit]');
  const velodyne = root.querySelector<HTMLInputElement>('[data-velodyne]');
  const mapInput = root.querySelector<HTMLInputElement>('[data-map]');
  const trajectoryInput = root.querySelector<HTMLInputElement>('[data-trajectory]');
  const status = root.querySelector<HTMLElement>('[data-status]');
  const canvasHost = root.querySelector<HTMLElement>('.view-3d-canvas');
  if (!select || !limit || !mapLimit || !velodyne || !mapInput || !trajectoryInput || !status || !canvasHost) throw new Error("3D パネルの要素がありません");
  const report = createStatusReporter(status);
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true }); }
  catch (error) { report('webgl', `3D を描けません: ${error instanceof Error ? error.message : String(error)}`); return () => { root.remove(); }; }
  canvasHost.append(renderer.domElement);
  const scene = new Scene(); scene.background = new Color(0x17212a);
  const camera = new PerspectiveCamera(50, 1, 0.05, 10000); camera.up.set(0, 0, 1); camera.position.set(12, -12, 12);
  const controls = new OrbitControls(camera, renderer.domElement); controls.update();
  const grid = new GridHelper(100, 100); grid.rotation.x = Math.PI / 2; scene.add(grid);
  const robot = new Group(); robot.add(new AxesHelper(1)); robot.add(new Mesh(new BoxGeometry(0.8, 0.5, 0.3), new MeshBasicMaterial({ color: 0xffaa33, wireframe: true }))); scene.add(robot);
  const overlayGroup = new Group(); scene.add(overlayGroup); const detachOverlays = attachOverlays(overlayGroup);
  const tree = new TransformTree();
  const client = context.connections.viewing;
  const releases: (() => void)[] = [];
  const layers = new Map<string, CloudLayer>();
  const workers = new Map<string, LatestWorker>();
  let selectedFrame = readStoredText(storageKeys.selected3dFrame) ?? frameNames.map;
  let odometry: Odometry | undefined;
  const paths = new Map<string, { message: Path; line: Line }>();
  const setObjectTransform = (object: Group | Line | CloudLayer['object'], frame: string, label: string): boolean => {
    const transform = tree.lookup(frame, selectedFrame);
    object.visible = !!transform;
    report(label, transform ? '' : `${label}: ${frame} から ${selectedFrame} への TF がありません`);
    if (!transform) return false;
    object.position.copy(transform.translation); object.quaternion.copy(transform.rotation); return true;
  };
  const refresh = () => {
    for (const [name, layer] of layers) if (layer.frame) setObjectTransform(layer.object, layer.frame, name);
    for (const [name, path] of paths) setObjectTransform(path.line, path.message.header.frame_id, name);
    const transform = tree.lookup(frameNames.robot, selectedFrame);
    if (transform) { robot.visible = true; robot.position.copy(transform.translation); robot.quaternion.copy(transform.rotation); report('robot', ''); }
    else if (odometry && setObjectTransform(robot, odometry.header.frame_id, 'robot')) {
      const pose = odometry.pose.pose; const position = new Vector3(pose.position.x, pose.position.y, pose.position.z).applyQuaternion(robot.quaternion);
      robot.position.add(position); robot.quaternion.multiply(new Quaternion(pose.orientation.x, pose.orientation.y, pose.orientation.z, pose.orientation.w));
    } else { robot.visible = false; report('robot', 'ロボットの TF または odom がありません'); }
  };
  const updateFrames = () => {
    const frames = tree.frames(); if (!frames.length) return;
    if (!frames.includes(selectedFrame)) selectedFrame = frames.includes(frameNames.map) ? frameNames.map : frames[0] ?? frameNames.map;
    select.replaceChildren(...frames.map((frame) => { const option = document.createElement('option'); option.value = frame; option.textContent = frame; return option; }));
    select.value = selectedFrame; refresh();
  };
  select.onchange = () => { selectedFrame = select.value; writeStoredText(storageKeys.selected3dFrame, selectedFrame); refresh(); };
  for (const [topic, isStatic] of [[topicNames.transform, false], [topicNames.staticTransform, true]] as const) {
    releases.push(client.subscribeToTopic(topic), context.topicStore.subscribe(topic, (entry) => { tree.update(entry.value as TransformMessage, isStatic, entry.receivedAtMs); updateFrames(); }));
  }
  releases.push(client.subscribeToTopic(topicNames.localizationOdometry), context.topicStore.subscribe(topicNames.localizationOdometry, (entry) => { odometry = entry.value as Odometry; refresh(); }));
  const subscribePath = (topic: string, name: string) => {
    const release = client.subscribeToTopic(topic);
    const stop = context.topicStore.subscribe(topic, (entry) => {
      const value = entry.value as Path & { path?: Path };
      checkMission();
      const message = value.path ?? value;
      if (!Array.isArray(message.poses)) { report(name, `${name}: 経路の形式を読めません`); return; }
      const old = paths.get(name); if (old) { scene.remove(old.line); old.line.geometry.dispose(); (old.line.material as LineBasicMaterial).dispose(); }
      const points = message.poses.map(({ pose }) => new Vector3(pose.position.x, pose.position.y, pose.position.z));
      const line = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: name === '軌跡' ? 0x44ddff : 0xffdd44 }));
      paths.set(name, { message, line }); scene.add(line); refresh();
    });
    return () => { release(); stop(); const old = paths.get(name); if (old) { scene.remove(old.line); old.line.geometry.dispose(); (old.line.material as LineBasicMaterial).dispose(); paths.delete(name); } };
  };
  let releaseTrajectory = subscribePath(trajectoryInput.value, '軌跡');
  trajectoryInput.onchange = () => { releaseTrajectory(); releaseTrajectory = subscribePath(trajectoryInput.value, '軌跡'); };
  releases.push(subscribePath(topicNames.missionPath, '走行経路'));
  const checkMission = () => {
    const channel = [...client.channels.values()].find((item) => item.topic === topicNames.missionPath);
    const decoder = channel && context.channelBinding.decoderFor(channel);
    report('mission', !channel ? '走行経路: トピックがありません' : decoder && !decoder.isDecodable ? `走行経路: ${decoder.reason}` : context.topicStore.decodeError(topicNames.missionPath) ? `走行経路: ${context.topicStore.decodeError(topicNames.missionPath)}` : '');
  };
  releases.push(client.on('channelsChanged', checkMission)); checkMission();
  const makeCloud = (name: string, capacity: number) => {
    const layer = new CloudLayer(capacity); layers.set(name, layer); scene.add(layer.object);
    startWorker(name, layer);
  };
  const startWorker = (name: string, layer: CloudLayer) => {
    workers.get(name)?.dispose();
    try {
      const worker = new LatestWorker(new Worker(new URL('../../decoding/worker.ts', import.meta.url), { type: 'module' }), (response: PointCloudResponse) => {
        if (name === 'velodyne' && !velodyne.checked) return;
        if ('error' in response) { report(name, `${name}: ${response.error}`); return; }
        report(name, ''); layer.update(response.result, response.frame); refresh();
      }, (message) => { report(name, `${name}: Worker の失敗: ${message}`); });
      workers.set(name, worker);
    } catch (error) { report(name, `${name}: Worker を作れません: ${String(error)}`); }
  };
  makeCloud('点群', pointCloudLimits.defaultMaximumPoints); makeCloud('保存地図', pointCloudLimits.savedMapMaximumPoints); makeCloud('velodyne', pointCloudLimits.defaultMaximumPoints);
  let releaseMap = client.subscribeToTopic(mapInput.value);
  mapInput.onchange = () => { releaseMap(); releaseMap = client.subscribeToTopic(mapInput.value); const layer = layers.get('保存地図'); if (layer) { layer.object.visible = false; layer.frame = ''; startWorker('保存地図', layer); } };
  let releaseVelodyne: (() => void) | undefined;
  velodyne.onchange = () => { releaseVelodyne?.(); releaseVelodyne = velodyne.checked ? client.subscribeToTopic(topicNames.velodynePoints) : undefined; const layer = layers.get('velodyne'); if (layer && !velodyne.checked) { layer.object.visible = false; layer.frame = ''; } };
  releases.push(client.subscribeToTopic(defaultPointCloud));
  releases.push(client.on('message', (message) => {
    if (message.topic === topicNames.missionPath) checkMission();
    const channel = client.channels.get(message.channelId);
    if (!channel || channel.schemaName !== 'sensor_msgs/msg/PointCloud2') return;
    const name = message.topic === defaultPointCloud ? '点群' : message.topic === mapInput.value ? '保存地図' : message.topic === topicNames.velodynePoints && velodyne.checked ? 'velodyne' : undefined;
    if (!name) return;
    const maximumPoints = name === '保存地図' ? Math.max(1, Math.min(pointCloudLimits.savedMapMaximumPoints, Math.floor(Number(mapLimit.value) || pointCloudLimits.savedMapMaximumPoints))) : Math.max(1, Math.min(pointCloudLimits.savedMapMaximumPoints, Math.floor(Number(limit.value) || pointCloudLimits.defaultMaximumPoints)));
    workers.get(name)?.submit({ channel, payload: message.payload, maximumPoints });
  }));
  let pointer: { x: number; y: number } | undefined;
  renderer.domElement.addEventListener('pointerdown', (event) => { pointer = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!pointer || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > clickTolerance) { pointer = undefined; return; }
    pointer = undefined; const rect = renderer.domElement.getBoundingClientRect();
    const raycaster = new Raycaster(); raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const result = groundClick(raycaster.ray, selectedFrame, tree, Date.now()); report('click', result.isPlaceable ? '' : result.reason); notifyGroundClick(result);
  });
  let animation = 0;
  const draw = () => { const width = canvasHost.clientWidth || 1; const height = canvasHost.clientHeight || 1; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); controls.update(); renderer.render(scene, camera); animation = requestAnimationFrame(draw); }; draw();
  return () => { cancelAnimationFrame(animation); releases.forEach((release) => { release(); }); releaseTrajectory(); releaseMap(); releaseVelodyne?.(); workers.forEach((worker) => { worker.dispose(); }); layers.forEach((layer) => { layer.dispose(); }); detachOverlays(); controls.dispose(); renderer.dispose(); root.remove(); };
};
