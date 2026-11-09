import { diagnosticNames, topicNames } from "../../config.ts";
import { createElement } from "../../layout/dom.ts";
import type { MountPanel } from "../../layout/panelContext.ts";
import type { DiagnosticStatus } from "../../store/diagnosticsStore.ts";
import { createCn0Bars } from "./cn0Bars.ts";
import { createCorrectionSection } from "./correctionSection.ts";
import { parseSatellites } from "./parseSatellites.ts";
import { createSkyPlot, skyPlotLegend } from "./skyPlot.ts";

const STALE_AFTER_MS = 5000;
const REFRESH_INTERVAL_MS = 1000;

function isStale(status: DiagnosticStatus): boolean {
  return Date.now() - status.receivedAtMs > STALE_AFTER_MS;
}

function appendSatellites(content: HTMLElement, status: DiagnosticStatus | undefined): void {
  if (!status) {
    content.append(createElement("p", undefined, "衛星の診断はまだ届いていません"));
    return;
  }
  if (isStale(status)) {
    content.append(createElement("p", undefined, "衛星の診断は古くなっています"));
  }
  const parsed = parseSatellites(status.values);
  content.append(createSkyPlot(parsed.satellites), createElement("p", undefined, skyPlotLegend()), createCn0Bars(parsed.satellites));
  if (parsed.unparsed.length > 0) {
    content.append(createElement("p", undefined, `解析できない衛星: ${parsed.unparsed.length} 件`));
  }
  if (parsed.satellites.length === 0) {
    content.append(createElement("p", undefined, "衛星の情報はありません"));
  }
}

export const mountPanel: MountPanel = (container, context) => {
  const render = (): void => {
    const content = createElement("div", "satellites-panel");
    content.append(createElement("h2", undefined, "衛星"));
    appendSatellites(content, context.diagnosticsStore.get(diagnosticNames.satellites));
    const correction = context.diagnosticsStore.get(diagnosticNames.correction);
    content.append(createCorrectionSection(correction, correction !== undefined && isStale(correction)));
    container.replaceChildren(content);
  };
  const unsubscribeTopic = context.connections.viewing.subscribeToTopic(topicNames.diagnostics);
  const unsubscribe = context.diagnosticsStore.subscribe(render);
  const timer = window.setInterval(render, REFRESH_INTERVAL_MS);
  render();
  return () => {
    unsubscribe();
    unsubscribeTopic();
    window.clearInterval(timer);
    container.replaceChildren();
  };
};
