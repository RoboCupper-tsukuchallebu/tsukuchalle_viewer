import { requestConfirmation } from "../../control/confirmDialog.ts";
import type { PanelContext } from "../../layout/panelContext.ts";

type Service = { id: string; running: boolean; started_at: string | null; image_tag: string | null };
const labels: Record<string, string> = {
  drive: "drive", teleop: "teleop", joy: "joy", mux: "mux", nav: "nav",
  localization_mapping: "localization（地図作成）", localization_localization: "localization（自己位置推定）", bag_record: "rosbag 記録",
};
const headers = { "X-Requested-With": "tsukuchalle-viewer" };

export function mountPanel(container: HTMLElement, context: PanelContext): () => void {
  const title = document.createElement("h2");
  title.textContent = "サービス";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  const list = document.createElement("div");
  container.append(title, message, list);
  const state = { disposed: false, busy: false, polling: false };
  let services: Service[] = [];
  const render = () => {
    list.replaceChildren();
    for (const service of services) {
      const row = document.createElement("section");
      const text = document.createElement("p");
      text.textContent = `${labels[service.id] ?? service.id}: ${service.running ? "稼働中" : "停止中"} / 起動時刻: ${service.started_at ?? "—"} / イメージ: ${service.image_tag ?? "—"}`;
      const button = document.createElement("button");
      const action = service.running ? "stop" : "start";
      const verb = service.running ? "停止" : "起動";
      button.type = "button";
      button.textContent = verb;
      button.disabled = !context.writeGate.isEnabled || state.busy;
      button.addEventListener("click", () => { void (async () => {
        if (!context.writeGate.isEnabled || state.busy) return;
        const confirmed = await requestConfirmation({ title: `${labels[service.id]}を${verb}`, lines: [`${labels[service.id]}を${verb}します。`, ...(service.id === "drive" && action === "start" ? ["モーターはゲームパッドの Start まで動かない"] : []), ...(service.id === "localization_mapping" && action === "start" ? ["地図作成は既存の地図を上書きします。"] : []), ...(service.id === "bag_record" && action === "stop" ? ["記録を終了し、保存が完了するまで待ちます。"] : [])], confirmLabel: verb });
        // 状態は確認画面を開いている間にも変わる。
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!confirmed || !context.writeGate.isEnabled || state.disposed || state.busy) return;
        state.busy = true; render();
        try {
          const response = await fetch(`/api/services/${service.id}/${action}`, { method: "POST", headers });
          if (!response.ok) throw new Error();
          message.textContent = `${verb}しました。`;
        } catch { message.textContent = `${verb}に失敗しました。状態を確認してください。`; }
        finally { state.busy = false; await refresh(); }
      })(); });
      row.append(text, button); list.append(row);
    }
  };
  const refresh = async () => {
    if (state.disposed || document.hidden || state.busy || state.polling) return;
    state.polling = true;
    try {
      const response = await fetch("/api/services", { headers, cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!state.disposed) { services = data as Service[]; render(); }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } catch { if (!state.disposed) message.textContent = "サービスの状態を取得できません。"; }
    finally { state.polling = false; }
  };
  const unsubscribe = context.writeGate.subscribe(render);
  const timer = window.setInterval(() => { void refresh(); }, 2000);
  void refresh();
  return () => { state.disposed = true; clearInterval(timer); unsubscribe(); };
}
