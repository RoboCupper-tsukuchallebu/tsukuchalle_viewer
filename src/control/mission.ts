import type { ViewerConnections } from "../connection/connections.ts";
import type { TopBar } from "../layout/topBar.ts";
import type { WriteGate } from "./writeGate.ts";
import { requestConfirmation } from "./confirmDialog.ts";
import type { TopicStore } from "../store/topicStore.ts";
import { actionRoot, MissionClient, record } from "./missionClient.ts";

export type MissionControlsContext = { topBar: TopBar; connections: ViewerConnections; writeGate: WriteGate; topicStore?: TopicStore };
type ControlKind = "stop" | "pause" | "resume";

function cancelMessage(result: Record<string, unknown>): string {
  const goals = result["goals_canceling"];
  const count = Array.isArray(goals) ? goals.length : 0;
  if (result["return_code"] === 1 && count === 0) return "取り消す goal がありません";
  if (result["return_code"] === 0 && count > 0) return "取り消しを受け付けました";
  return "停止に失敗しました";
}

export function startMissionControls({ topBar, connections, topicStore }: MissionControlsContext): void {
  const client = new MissionClient(connections.writing);
  const notice = document.createElement("p");
  notice.className = "mission-control-notice";
  notice.setAttribute("role", "status");
  topBar.element.append(notice);
  let paused = false;
  const show = (message: string, failed = false) => {
    notice.textContent = message;
    notice.classList.toggle("is-error", failed);
  };
  const update = () => {
    const available = connections.writing?.state === "connected";
    if (!available && !notice.classList.contains("is-error")) notice.textContent = "書き込み接続がありません";
    if (available && notice.textContent === "書き込み接続がありません") notice.textContent = "";
    topBar.setStopHandler(available ? () => { void run("stop"); } : undefined);
    topBar.setPauseHandler(available ? () => { void run(paused ? "resume" : "pause"); } : undefined);
    const button = topBar.element.querySelector<HTMLButtonElement>('[data-control="pause"]');
    if (button) button.textContent = paused ? "再開" : "一時停止";
  };
  const run = async (kind: ControlKind) => {
    try {
      if (kind === "resume" && !await requestConfirmation({ title: "mission を再開", lines: ["ロボットが動きます。"], confirmLabel: "再開" })) return;
      if (kind === "stop") {
        const message = cancelMessage(record(await client.cancel()));
        show(message, message === "停止に失敗しました");
        return;
      }
      const result = record(await client.trigger(kind));
      const message = typeof result["message"] === "string" ? result["message"] : "";
      if (result["success"] !== true) {
        show(`${kind}: ${message || "失敗"}`, true);
        return;
      }
      paused = kind === "pause";
      show(`${paused ? "一時停止" : "再開"}: ${message}`);
      update();
    } catch (error) {
      show(`${kind}: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };
  subscribeFeedback(topicStore, (value) => {
    paused = value;
    update();
  });
  connections.writing?.on("stateChanged", update);
  update();
}

function subscribeFeedback(topicStore: TopicStore | undefined, setPaused: (value: boolean) => void): void {
  topicStore?.subscribe(`${actionRoot}/feedback`, (entry) => {
    const state = record(record(entry.value)["feedback"])["state"];
    if (state === "PAUSED") {
      setPaused(true);
    } else if (state === "FOLLOWING" || state === "PLANNING" || state === "IDLE") {
      setPaused(false);
    }
  });
}
