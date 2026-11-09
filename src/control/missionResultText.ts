import { record } from "./missionClient.ts";

const statusLabels: Record<number, string> = {
  0: "不明", 1: "受理", 2: "実行中", 3: "取り消し中",
  4: "成功（SUCCEEDED）", 5: "取り消し（CANCELED）", 6: "中断（ABORTED）",
};

export function missionResultText(value: unknown): string {
  const response = record(value);
  const result = record(response["result"]);
  const status = typeof response["status"] === "number" ? statusLabels[response["status"]] ?? "不明" : "不明";
  const success = result["success"] === true ? "成功" : result["success"] === false ? "失敗" : "不明";
  const message = typeof result["message"] === "string" ? result["message"] : "";
  const count = typeof result["reached_count"] === "number" ? result["reached_count"] : "不明";
  return `結果: ${status}、処理: ${success}、到達数: ${count}${message ? `、メッセージ: ${message}` : ""}`;
}

export function missionFeedbackText(value: unknown): string {
  const feedback = record(record(value)["feedback"]);
  const state = typeof feedback["state"] === "string" ? feedback["state"] : "不明";
  const index = typeof feedback["current_waypoint_index"] === "number" ? feedback["current_waypoint_index"] : "不明";
  const distance = typeof feedback["distance_to_waypoint_m"] === "number" ? `${feedback["distance_to_waypoint_m"].toFixed(2)} m` : "不明";
  const blocked = feedback["is_blocked"] === true ? "あり" : feedback["is_blocked"] === false ? "なし" : "不明";
  return `状態: ${state}、waypoint 番号: ${index}、残り距離: ${distance}、障害物による停止: ${blocked}`;
}

export function missionStatusText(value: unknown): string {
  const statuses = record(value)["status_list"];
  if (!Array.isArray(statuses) || statuses.length === 0) return "goal の状態: なし";
  return `goal の状態: ${statuses.map((item: unknown) => {
    const status = record(item)["status"];
    return typeof status === "number" ? statusLabels[status] ?? "不明" : "不明";
  }).join("、")}`;
}
