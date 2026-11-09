import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { staleThresholdMs, topicNames } from "../../config.ts";
import { requestConfirmation } from "../../control/confirmDialog.ts";
import { actionRoot, createGoal, MissionClient, record } from "../../control/missionClient.ts";
import type { MountPanel } from "../../layout/panelContext.ts";
import { waypointStore } from "../../store/waypointStore.ts";
import { addOverlay, getRobotPoseInMap, onGroundClick, onGroundClickRejected } from "../3d/viewApi.ts";

let missionResult = "";
const resultListeners = new Set<(message: string) => void>();
function setMissionResult(message: string): void { missionResult = message; resultListeners.forEach((listener) => { listener(message); }); }

export const mountPanel: MountPanel = (container, context) => {
  const heading = document.createElement("h2"); heading.textContent = "Waypoints";
  const hint = document.createElement("p"); hint.textContent = "3D の地面をクリックして配置します（map 座標）。";
  const list = document.createElement("ol");
  const send = document.createElement("button"); send.type = "button"; send.textContent = "mission に送信";
  const result = document.createElement("p"); result.setAttribute("role", "status"); result.textContent = missionResult;
  const resultListener = (message: string) => { result.textContent = message; }; resultListeners.add(resultListener);
  const feedback = document.createElement("p");
  const previousFeedback = context.topicStore.get(`${actionRoot}/feedback`);
  if (previousFeedback) feedback.textContent = `feedback: ${JSON.stringify(previousFeedback.value)}`;
  const status = document.createElement("p");
  const previousStatus = context.topicStore.get(`${actionRoot}/status`);
  if (previousStatus) status.textContent = `status: ${JSON.stringify(previousStatus.value)}`;
  container.append(heading, hint, list, send, result, feedback, status);
  const client = new MissionClient(context.connections.writing);
  const overlay = new Group(); const releaseOverlay = addOverlay(overlay);
  const releases = [onGroundClick((point) => { waypointStore.add(point.x, point.y); }), onGroundClickRejected((reason) => { result.textContent = reason; })];
  const clearOverlay = () => { while (overlay.children.length) { const child = overlay.children[0]; if (!child) break; overlay.remove(child); if (child instanceof Mesh || child instanceof Line) { const object = child as Mesh<BufferGeometry, MeshBasicMaterial> | Line<BufferGeometry, LineBasicMaterial>; object.geometry.dispose(); object.material.dispose(); } } };
  const render = () => {
    list.replaceChildren(); clearOverlay();
    const points = waypointStore.get();
    const pose = getRobotPoseInMap(); const height = pose.isAvailable ? pose.z : 0;
    for (const [index, point] of points.entries()) {
      const row = document.createElement("li");
      const label = document.createElement("span"); label.textContent = `${point.x.toFixed(2)}, ${point.y.toFixed(2)} `;
      const radiusLabel = document.createElement("label"); radiusLabel.textContent = "到達半径 m ";
      const radius = document.createElement("input"); radius.type = "number"; radius.min = "0"; radius.step = "0.1"; radius.value = String(point.arrival_radius_m); radius.addEventListener("change", () => { waypointStore.radius(index, radius.valueAsNumber); }); radiusLabel.append(radius);
      const button = (text: string, action: () => void) => { const element = document.createElement("button"); element.type = "button"; element.textContent = text; element.addEventListener("click", action); return element; };
      row.append(label, radiusLabel, button("↑", () => { waypointStore.move(index, -1); }), button("↓", () => { waypointStore.move(index, 1); }), button("削除", () => { waypointStore.remove(index); })); list.append(row);
      const marker = new Mesh(new SphereGeometry(0.2), new MeshBasicMaterial({ color: 0xffaa00 })); marker.position.set(point.x, point.y, height); overlay.add(marker);
    }
    if (points.length > 1) { const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, height]), 3)); overlay.add(new Line(geometry, new LineBasicMaterial({ color: 0xffaa00 }))); }
    send.disabled = !context.writeGate.isEnabled || context.connections.writing?.state !== "connected" || points.length === 0;
  };
  releases.push(waypointStore.subscribe(render), context.writeGate.subscribe(render));
  if (context.connections.writing) {
    releases.push(context.connections.writing.on("stateChanged", render));
  }
  releases.push(context.topicStore.subscribe(`${actionRoot}/feedback`, (entry) => { feedback.textContent = `feedback: ${JSON.stringify(entry.value)}`; }), context.topicStore.subscribe(`${actionRoot}/status`, (entry) => { status.textContent = `status: ${JSON.stringify(entry.value)}`; }));
  const canSend = () => context.writeGate.isEnabled && context.connections.writing?.state === "connected";
  send.addEventListener("click", () => { void (async () => {
    if (!canSend()) return;
    let goal: ReturnType<typeof createGoal>;
    try { goal = createGoal(waypointStore.get()); } catch (error) { result.textContent = String(error); return; }
    const points = goal.goal.waypoints; const first = points[0]; const last = points.at(-1); if (!first || !last) return;
    const pose = getRobotPoseInMap(); const localization = record(context.topicStore.get(topicNames.localizationStatus)?.value)["state"];
    const currentIndex = record(record(context.topicStore.get(`${actionRoot}/feedback`)?.value)["feedback"])["current_waypoint_index"];
    const currentText = typeof currentIndex === "number" ? `（現在 ${currentIndex + 1} 番目）` : "";
    const warnings = [`実行中の mission ${currentText}は打ち切られ、新しい goal に置き換えられます（preempt）。`];
    const localizationAge = context.topicStore.ageMs(topicNames.localizationStatus);
    if (localization !== 1 || localizationAge === undefined || localizationAge > staleThresholdMs.status) warnings.push("自己位置が TRACKING ではないか、情報が古くなっています。");
    const approved = await requestConfirmation({ title: "waypoint の送信", lines: [`${points.length} 件、map 座標`, `最初: ${first.x}, ${first.y} / 最後: ${last.x}, ${last.y}`, `自己位置: ${localization === 1 ? "TRACKING" : "TRACKING 以外または不明"}`, `最初までの距離: ${pose.isAvailable ? `${Math.hypot(first.x - pose.x, first.y - pose.y).toFixed(2)} m` : `不明（${pose.reason}）`}`], warnings, confirmLabel: "送信" });
    if (!approved || !canSend()) return;
    try { const response = record(await client.sendGoal(goal)); if (response["accepted"] !== true) { setMissionResult("goal は拒否されました"); return; } setMissionResult("goal を受理しました。結果を待っています"); try { const responseResult = record(await client.getResult(goal.goal_id)); setMissionResult(`結果: ${JSON.stringify(responseResult)}`); } catch (error) { setMissionResult(`結果は分かりません: ${String(error)}`); } } catch (error) { setMissionResult(`送信失敗: ${String(error)}`); }
  })(); });
  render();
  return () => { releases.forEach((release) => { release(); }); clearOverlay(); releaseOverlay(); resultListeners.delete(resultListener); container.replaceChildren(); };
};
