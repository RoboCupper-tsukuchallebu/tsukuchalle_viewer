import { diagnosticNames, topicNames } from "../../config.ts";
import { createElement } from "../../layout/dom.ts";
import type { MountPanel } from "../../layout/panelContext.ts";
import { fields, isStale, staleText } from "./statusData.ts";
import { appendFields } from "./renderFields.ts";
import { appendDiagnostic } from "./diagnostics.ts";
import { subscribeAvailable } from "./subscriptions.ts";
import "./status.css";

const statusSections = [
  { topic: topicNames.localizationStatus, title: "自己位置推定" },
  { topic: topicNames.followStatus, title: "走行" },
  { topic: topicNames.obstacleStatus, title: "障害物" },
];
const allTopics = [...statusSections.map((section) => section.topic), topicNames.diagnostics, topicNames.bridgeSystemInformation];

export const mountPanel: MountPanel = (container, context) => {
  const render = () => {
    const panel = createElement("div", "status-panel");
    panel.append(createElement("h1", undefined, "状態"));
    for (const { topic, title } of statusSections) {
      const section = createElement("section", "status-section");
      section.append(createElement("h2", undefined, title));
      const channel = [...context.connections.viewing.channels.values()].find((item) => item.topic === topic);
      const entry = context.topicStore.get(topic);
      if (channel && (channel.encoding === "" || (channel.encoding === "cdr" && !channel.schema))) {
        section.append(createElement("p", "status-stale", "型が bridge に無い（lightnav_msgs 未導入）"));
      } else if (channel && !context.channelBinding.decoderFor(channel).isDecodable) {
        section.append(createElement("p", "status-stale", "デコードできない"));
      } else if (!entry) {
        section.append(createElement("p", undefined, "データなし"));
      } else {
        if (isStale(entry)) {
          section.append(createElement("p", "status-stale", staleText(entry.receivedAtMs)));
        }
        appendFields(section, fields(entry.value), topic);
      }
      panel.append(section);
    }
    const summary = createElement("section", "status-section");
    summary.append(createElement("h2", undefined, "電池・GNSS・CPU"));
    for (const name of [diagnosticNames.battery, diagnosticNames.receiver, diagnosticNames.correction, diagnosticNames.rtk, diagnosticNames.localizationGnss]) {
      const item = createElement("div", "status-summary-item");
      if (!context.diagnosticsStore.get(name)) {
        item.append(createElement("h3", undefined, name));
      }
      appendDiagnostic(item, context.diagnosticsStore.get(name));
      summary.append(item);
    }
    summary.append(createElement("h3", undefined, "CPU・メモリ"));
    const system = context.topicStore.get(topicNames.bridgeSystemInformation);
    if (system && isStale(system)) {
      summary.append(createElement("p", "status-stale", staleText(system.receivedAtMs)));
    }
    appendFields(summary, fields(system?.value));
    panel.append(summary);
    const diagnostics = createElement("section", "status-section");
    diagnostics.append(createElement("h2", undefined, "diagnostics"));
    const statuses = context.diagnosticsStore.all().filter((status) => status.name !== diagnosticNames.satellites);
    if (!statuses.length) {
      diagnostics.append(createElement("p", undefined, "データなし"));
    }
    statuses.forEach((status) => { appendDiagnostic(diagnostics, status); });
    panel.append(diagnostics);
    container.replaceChildren(panel);
  };
  const stops = allTopics.map((topic) => context.topicStore.subscribe(topic, render));
  stops.push(context.diagnosticsStore.subscribe(render));
  stops.push(subscribeAvailable(context.connections.viewing, context.channelBinding, allTopics, render));
  const timer = setInterval(render, 1000);
  return () => {
    stops.forEach((stop) => { stop(); });
    clearInterval(timer);
  };
};
