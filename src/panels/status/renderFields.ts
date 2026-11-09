import { createElement } from "../../layout/dom.ts";
import { formatField } from "./statusData.ts";

export function appendFields(container: HTMLElement, entries: [string, unknown][], topic = ""): void {
  if (entries.length === 0) {
    container.append(createElement("p", undefined, "データなし"));
    return;
  }
  const list = createElement("dl", "status-fields");
  for (const [name, value] of entries) {
    list.append(createElement("dt", undefined, name), createElement("dd", undefined, formatField(name, value, topic)));
  }
  container.append(list);
}
