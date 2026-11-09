import { staleThresholdMs, topicNames } from "../../config.ts";
import type { TopicEntry } from "../../store/topicStore.ts";

export const statusStaleThresholdMs = staleThresholdMs.status;
const localizationStates = ["INITIALIZING", "TRACKING", "GPS_ONLY", "ODOM_ONLY", "LOST", "INPUT_STALE"];
const followStates = ["OK", "NO_PATH", "POSE_STALE", "OBSTACLE_STALE", "BLOCKED", "AT_PATH_END", "STUCK"];
const followLayers = ["LAYER_FOLLOW", "LAYER_AVOID", "LAYER_NONE"];

export function isStale(entry: TopicEntry, now = Date.now()): boolean {
  return now - entry.receivedAtMs > statusStaleThresholdMs;
}

export function staleText(receivedAtMs: number, now = Date.now()): string {
  return `受信データが古い（受信から ${Math.max(0, Math.floor((now - receivedAtMs) / 1000))} 秒）`;
}

export function fields(value: unknown): [string, unknown][] {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

export function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Number(value.toFixed(3))) : String(value);
  }
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "データなし";
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return formatValue(Array.from(value as Float64Array));
  }
  try {
    return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? String(item) : item);
  } catch {
    return "表示できない値";
  }
}

export function formatField(name: string, value: unknown, topic = ""): string {
  let names: string[] | undefined;
  if (topic === topicNames.localizationStatus && name === "state") {
    names = localizationStates;
  } else if (topic === topicNames.localizationStatus && name === "mode") {
    names = ["MODE_LOCALIZATION", "MODE_MAPPING"];
  } else if (topic === topicNames.followStatus && name === "state") {
    names = followStates;
  } else if (topic === topicNames.followStatus && name === "active_layer") {
    names = followLayers;
  }
  if (names && typeof value === "number") {
    return `${names[value] ?? "不明"} (${value})`;
  }
  if (name === "nearest_distance_m" && value === Infinity) {
    return "なし";
  }
  if (name === "header" && value && typeof value === "object") {
    const header = Object.fromEntries(fields(value));
    const stamp = Object.fromEntries(fields(header["stamp"]));
    return `stamp: ${formatValue(stamp["sec"])} 秒 ${formatValue(stamp["nanosec"])} ナノ秒 / frame_id: ${formatValue(header["frame_id"])}`;
  }
  return formatValue(value);
}

export function localizationSummary(entry: TopicEntry | undefined): { text: string; level: string } {
  if (!entry) {
    return { text: "自己位置: データなし", level: "unknown" };
  }
  const values = Object.fromEntries(fields(entry.value));
  if (isStale(entry)) {
    return { text: `自己位置: ${staleText(entry.receivedAtMs)} / ${formatField("state", values["state"], topicNames.localizationStatus)}`, level: "stale" };
  }
  const state = values["state"];
  const level = state === 1 ? "ok" : state === 4 || state === 5 ? "error" : "warning";
  const parts = [`自己位置: ${formatField("state", state, topicNames.localizationStatus)}`];
  if (values["last_inlier_ratio"] !== undefined) {
    parts.push(`inlier: ${formatValue(values["last_inlier_ratio"])}`);
  }
  if (values["gps_status"] !== undefined) {
    parts.push(`GNSS: ${formatValue(values["gps_status"])}`);
  }
  parts.push(level === "ok" ? "正常" : level === "error" ? "危険" : "注意");
  return { text: parts.join(" / "), level };
}
