import type { DiagnosticStatus } from "./diagnosticsStore.ts";
import type { TopicEntry } from "./topicStore.ts";

const errorLevel = 2;

/** 最新の電池情報から、上部バーに出す警告を作る。 */
export function batteryWarning(diagnostic: DiagnosticStatus | undefined, lowBattery: TopicEntry | undefined, now: number, staleAfterMs: number): string | undefined {
  const freshDiagnostic = diagnostic && now - diagnostic.receivedAtMs <= staleAfterMs ? diagnostic : undefined;
  const freshLowBattery = lowBattery && now - lowBattery.receivedAtMs <= staleAfterMs ? lowBattery : undefined;
  const lowBatteryValue = (freshLowBattery?.value as { data?: unknown } | null)?.data === true;
  if (freshDiagnostic?.level !== errorLevel && !lowBatteryValue) return undefined;

  const rawCapacity = freshDiagnostic?.values["capacity_percent"];
  const messageCapacity = freshDiagnostic?.message.match(/^\s*(\d+(?:\.\d+)?)\s*%/)?.[1];
  const capacityText = rawCapacity === undefined ? messageCapacity : rawCapacity;
  const capacity = capacityText !== undefined && /^\d+(?:\.\d+)?$/.test(capacityText.trim()) ? Number(capacityText) : undefined;
  const capacityLabel = capacity !== undefined && Number.isFinite(capacity) ? `${capacity}%` : "残量不明";
  const status = freshDiagnostic?.values["status"] ?? freshDiagnostic?.values["ac"];
  const statusLabels: Record<string, string> = { Charging: "充電中", Discharging: "放電中", Full: "満充電", "Not charging": "充電していない", online: "外部電源接続中", offline: "外部電源未接続" };
  return `電池残量が少ない: ${capacityLabel} / ${statusLabels[status ?? ""] ?? "充電状態不明"}`;
}
