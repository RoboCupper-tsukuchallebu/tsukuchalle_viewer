import { createElement } from "../../layout/dom.ts";
import type { DiagnosticStatus } from "../../store/diagnosticsStore.ts";
import { parseL6Cn0 } from "./parseSatellites.ts";

export function createCorrectionSection(status: DiagnosticStatus | undefined, stale: boolean): HTMLElement {
  const section = createElement("section");
  section.append(createElement("h3", undefined, "CLAS / L6"));
  if (!status) {
    section.append(createElement("p", undefined, "CLAS の診断はまだ届いていません"));
    return section;
  }
  if (stale) {
    section.append(createElement("p", undefined, "CLAS の診断は古くなっています"));
  }
  const table = createElement("table", "channel-table satellites-table");
  for (const [key, value] of [["level", String(status.level)], ["message", status.message], ...Object.entries(status.values)]) {
    const row = createElement("tr");
    row.append(createElement("th", undefined, key), createElement("td", undefined, value));
    table.append(row);
  }
  section.append(table, createElement("p", undefined, "L6 C/N0：参考値（unreliable, display only）"));
  const values = Object.entries(parseL6Cn0(status.values["qzss_l6_cn0"] ?? "none"));
  section.append(createElement("p", undefined, values.length ? values.map(([prn, cn0]) => `${prn}: ${cn0} dB-Hz`).join(", ") : "L6 の参考値はありません"));
  return section;
}
