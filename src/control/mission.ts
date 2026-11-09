import type { ViewerConnections } from "../connection/connections.ts";
import type { TopBar } from "../layout/topBar.ts";
import type { WriteGate } from "./writeGate.ts";
import { requestConfirmation } from "./confirmDialog.ts";
import type { TopicStore } from "../store/topicStore.ts";
import { actionRoot, MissionClient, record } from "./missionClient.ts";

export type MissionControlsContext = { topBar: TopBar; connections: ViewerConnections; writeGate: WriteGate; topicStore?: TopicStore };
export function startMissionControls({ topBar, connections, topicStore }: MissionControlsContext): void {
  const client = new MissionClient(connections.writing);
  const notice = document.createElement("p");
  notice.className = "mission-control-notice";
  notice.setAttribute("role", "status");
  topBar.element.append(notice);
  let paused = false;
  const show = (message: string, failed = false) => { notice.textContent = message; notice.style.color = failed ? "red" : ""; };
  const run = async (kind: "stop" | "pause" | "resume") => {
    try {
      if (kind === "resume" && !await requestConfirmation({ title: "mission を再開", lines: ["ロボットが動きます。"], confirmLabel: "再開" })) return;
      if (kind === "stop") {
        const result = record(await client.cancel());
        const goals = result["goals_canceling"];
        const count = Array.isArray(goals) ? goals.length : 0;
        if (result["return_code"] === 1 && count === 0) show("取り消す goal がありません");
        else if (result["return_code"] === 0 && count > 0) show("取り消しを受け付けました");
        else show("停止に失敗しました", true);
      } else {
        const result = record(await client.trigger(kind));
        if (result["success"] !== true) { show(`${kind}: ${(typeof result["message"] === "string" ? result["message"] : "失敗")}`, true); return; }
        paused = kind === "pause";
        show(`${paused ? "一時停止" : "再開"}: ${(typeof result["message"] === "string" ? result["message"] : "")}`);
        update();
      }
    } catch (error) { show(`${kind}: ${error instanceof Error ? error.message : String(error)}`, true); }
  };
  const update = () => {
    const available = connections.writing?.state === "connected";
    topBar.setStopHandler(available ? () => { void run("stop"); } : undefined);
    topBar.setPauseHandler(available ? () => { void run(paused ? "resume" : "pause"); } : undefined);
    const button = topBar.element.querySelector<HTMLButtonElement>('[data-control="pause"]');
    if (button) button.textContent = paused ? "再開" : "一時停止";
  };
  topicStore?.subscribe(`${actionRoot}/feedback`, (entry) => {
    const state = record(record(entry.value)["feedback"])["state"];
    if (state === "PAUSED") { paused = true; update(); }
    else if (state === "FOLLOWING" || state === "PLANNING" || state === "IDLE") { paused = false; update(); }
  });
  connections.writing?.on("stateChanged", update);
  update();
}
