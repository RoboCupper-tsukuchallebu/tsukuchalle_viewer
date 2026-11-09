import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { staleThresholdMs, topicNames } from "../../config.ts";
import { requestConfirmation } from "../../control/confirmDialog.ts";
import { actionRoot, createGoal, MissionClient, record, type Waypoint } from "../../control/missionClient.ts";
import { missionResultText, missionFeedbackText, missionStatusText } from "../../control/missionResultText.ts";
import type { MountPanel, PanelContext } from "../../layout/panelContext.ts";
import { waypointStore } from "../../store/waypointStore.ts";
import { addOverlay, getRobotPoseInMap, onGroundClick, onGroundClickRejected } from "../3d/viewApi.ts";

const markerRadius = 0.2;
const markerColor = 0xffaa00;
let missionResult = "";
let latestGoalId: Uint8Array | undefined;
const resultListeners = new Set<(message: string) => void>();

function setMissionResult(message: string): void {
  missionResult = message;
  resultListeners.forEach((listener) => { listener(message); });
}

function isLatestGoal(goalId: Uint8Array): boolean {
  return latestGoalId !== undefined && goalId.every((byte, index) => byte === latestGoalId?.[index]);
}

function clearOverlay(overlay: Group): void {
  for (const child of [...overlay.children]) {
    overlay.remove(child);
    if (child instanceof Mesh || child instanceof Line) {
      const object = child as Mesh<BufferGeometry, MeshBasicMaterial> | Line<BufferGeometry, LineBasicMaterial>;
      object.geometry.dispose();
      object.material.dispose();
    }
  }
}

function makeButton(text: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function makeRow(point: Waypoint, index: number): HTMLLIElement {
  const row = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = `${point.x.toFixed(2)}, ${point.y.toFixed(2)} `;
  const radiusLabel = document.createElement("label");
  radiusLabel.textContent = "到達半径 m ";
  const radius = document.createElement("input");
  radius.type = "number";
  radius.min = "0";
  radius.step = "0.1";
  radius.value = String(point.arrival_radius_m);
  radius.addEventListener("change", () => {
    if (!Number.isFinite(radius.valueAsNumber) || radius.valueAsNumber < 0) {
      radius.value = String(point.arrival_radius_m);
      return;
    }
    waypointStore.radius(index, radius.valueAsNumber);
  });
  radiusLabel.append(radius);
  row.append(label, radiusLabel, makeButton("↑", () => { waypointStore.move(index, -1); }),
    makeButton("↓", () => { waypointStore.move(index, 1); }),
    makeButton("削除", () => { waypointStore.remove(index); }));
  return row;
}

function renderPoints(list: HTMLOListElement, overlay: Group): void {
  list.replaceChildren();
  clearOverlay(overlay);
  const points = waypointStore.get();
  const pose = getRobotPoseInMap();
  const height = pose.isAvailable ? pose.z : 0;
  for (const [index, point] of points.entries()) {
    list.append(makeRow(point, index));
    const marker = new Mesh(new SphereGeometry(markerRadius), new MeshBasicMaterial({ color: markerColor }));
    marker.position.set(point.x, point.y, height);
    overlay.add(marker);
  }
  if (points.length < 2) return;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, height]), 3));
  overlay.add(new Line(geometry, new LineBasicMaterial({ color: markerColor })));
}

function confirmation(goal: ReturnType<typeof createGoal>, context: PanelContext) {
  const points = goal.goal.waypoints;
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return Promise.resolve(false);
  const pose = getRobotPoseInMap();
  const localization = record(context.topicStore.get(topicNames.localizationStatus)?.value)["state"];
  const currentIndex = record(record(context.topicStore.get(`${actionRoot}/feedback`)?.value)["feedback"])["current_waypoint_index"];
  const currentText = typeof currentIndex === "number" ? `（現在 ${currentIndex + 1} 番目）` : "";
  const warnings = [`実行中の mission ${currentText}は打ち切られ、新しい goal に置き換えられます（preempt）。`];
  const localizationAge = context.topicStore.ageMs(topicNames.localizationStatus);
  if (localization !== 1 || localizationAge === undefined || localizationAge > staleThresholdMs.status) {
    warnings.push("自己位置が TRACKING ではないか、情報が古くなっています。");
  }
  return requestConfirmation({ title: "waypoint の送信", lines: [
    `${points.length} 件、map 座標`,
    `最初: ${first.x.toFixed(2)}, ${first.y.toFixed(2)} / 最後: ${last.x.toFixed(2)}, ${last.y.toFixed(2)}`,
    `自己位置: ${localization === 1 ? "TRACKING" : "TRACKING 以外または不明"}`,
    `最初までの距離: ${pose.isAvailable ? `${Math.hypot(first.x - pose.x, first.y - pose.y).toFixed(2)} m` : `不明（${pose.reason}）`}`,
  ], warnings, confirmLabel: "送信" });
}

async function sendMission(client: MissionClient, context: PanelContext): Promise<void> {
  const canSend = () => context.writeGate.isEnabled && context.connections.writing?.state === "connected";
  if (!canSend()) return;
  let goal: ReturnType<typeof createGoal>;
  try {
    goal = createGoal(waypointStore.get());
  } catch (error) {
    setMissionResult(String(error));
    return;
  }
  if (!await confirmation(goal, context) || !canSend()) return;
  latestGoalId = goal.goal_id.uuid.slice();
  try {
    const response = record(await client.sendGoal(goal));
    if (!isLatestGoal(goal.goal_id.uuid)) return;
    if (response["accepted"] !== true) {
      setMissionResult("goal は拒否されました");
      return;
    }
    setMissionResult("goal を受理しました。結果を待っています");
    const result = record(await client.getResult(goal.goal_id));
    if (isLatestGoal(goal.goal_id.uuid)) setMissionResult(missionResultText(result));
  } catch (error) {
    if (isLatestGoal(goal.goal_id.uuid)) setMissionResult(`mission の応答失敗: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const mountPanel: MountPanel = (container, context) => {
  const heading = document.createElement("h2");
  heading.textContent = "Waypoints";
  const hint = document.createElement("p");
  hint.textContent = "3D の地面をクリックして配置します（map 座標）。";
  const list = document.createElement("ol");
  const client = new MissionClient(context.connections.writing);
  const send = makeButton("mission に送信", () => { void sendMission(client, context); });
  const result = document.createElement("p");
  result.setAttribute("role", "status");
  result.textContent = missionResult;
  const resultListener = (message: string) => { result.textContent = message; };
  resultListeners.add(resultListener);
  const feedback = document.createElement("p");
  const status = document.createElement("p");
  const previousFeedback = context.topicStore.get(`${actionRoot}/feedback`);
  const previousStatus = context.topicStore.get(`${actionRoot}/status`);
  if (previousFeedback) feedback.textContent = missionFeedbackText(previousFeedback.value);
  if (previousStatus) status.textContent = missionStatusText(previousStatus.value);
  container.append(heading, hint, list, send, result, feedback, status);
  const overlay = new Group();
  const releaseOverlay = addOverlay(overlay);
  const render = () => {
    renderPoints(list, overlay);
    send.disabled = !context.writeGate.isEnabled || context.connections.writing?.state !== "connected" || waypointStore.get().length === 0;
  };
  const releases = [onGroundClick((point) => { waypointStore.add(point.x, point.y); }),
    onGroundClickRejected((reason) => { result.textContent = reason; }),
    waypointStore.subscribe(render), context.writeGate.subscribe(render),
    context.topicStore.subscribe(`${actionRoot}/feedback`, (entry) => { feedback.textContent = missionFeedbackText(entry.value); }),
    context.topicStore.subscribe(`${actionRoot}/status`, (entry) => { status.textContent = missionStatusText(entry.value); })];
  if (context.connections.writing) releases.push(context.connections.writing.on("stateChanged", render));
  render();
  return () => {
    releases.forEach((release) => { release(); });
    clearOverlay(overlay);
    releaseOverlay();
    resultListeners.delete(resultListener);
    container.replaceChildren();
  };
};
