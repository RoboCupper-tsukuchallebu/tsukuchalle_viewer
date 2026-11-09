import { createElement } from "../../layout/dom.ts";
import type { DiagnosticStatus } from "../../store/diagnosticsStore.ts";
import { appendFields } from "./renderFields.ts";
import { staleText, statusStaleThresholdMs } from "./statusData.ts";

const levelNames = ["OK", "WARN", "ERROR", "STALE"];

export function appendDiagnostic(container: HTMLElement, status: DiagnosticStatus | undefined): void {
  if (!status) {
    container.append(createElement("p", undefined, "データなし"));
    return;
  }
  const level = levelNames[status.level] ?? "不明";
  container.append(createElement("h3", `diagnostic-level level-${status.level}`, `${status.name} — ${level}`));
  if (Date.now() - status.receivedAtMs > statusStaleThresholdMs) {
    container.append(createElement("p", "status-stale", staleText(status.receivedAtMs)));
  }
  if (status.message) {
    container.append(createElement("p", undefined, status.message));
  }
  appendFields(container, Object.entries(status.values));
}
