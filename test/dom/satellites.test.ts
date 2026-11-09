// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { mountPanel } from "../../src/panels/satellites/index.ts";
import type { PanelContext } from "../../src/layout/panelContext.ts";
import { DiagnosticsStore } from "../../src/store/diagnosticsStore.ts";
import values from "../fixtures/satellitesDiagnostics.json";

test("診断更新で描画し破棄後は更新しない", () => {
  // Arrange
  const store = new DiagnosticsStore();
  const container = document.createElement("div");
  const unsubscribe = vi.spyOn(store, "subscribe");
  const dispose = mountPanel(container, { diagnosticsStore: store, connections: { viewing: { subscribeToTopic: () => () => {} } } } as unknown as PanelContext);
  expect(container.textContent).toContain("CLAS の診断はまだ届いていません");
  // Act
  store.update({ status: [{ name: "ma10p_node: satellites", values: Object.entries(values).map(([key, value]) => ({ key, value })) }] }, Date.now());
  // Assert
  expect(container.querySelectorAll("circle[data-satellite]")).toHaveLength(9);
  expect(container.querySelector('[data-satellite="GPS 20"]')).toBeNull();
  dispose();
  store.update({ status: [{ name: "ma10p_node: satellites", values: [] }] }, Date.now());
  expect(container.childElementCount).toBe(0);
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("角度なしの棒や不明な信号と CLAS の参考値を表示し古さを更新する", () => {
  // Arrange
  vi.useFakeTimers();
  const store = new DiagnosticsStore();
  const container = document.createElement("div");
  const unsubscribeTopic = vi.fn();
  const dispose = mountPanel(container, { diagnosticsStore: store, connections: { viewing: { subscribeToTopic: () => unsubscribeTopic } } } as unknown as PanelContext);
  // Act
  store.update({ status: [
    { name: "ma10p_node: satellites", values: [{ key: "GPS 20", value: "el - az - sig? 30" }, { key: "bad", value: "el 1 az 2" }] },
    { name: "ma10p_node: CLAS", values: [{ key: "qzss_l6_cn0", value: "02:39, 03:35 (unreliable, display only)" }] },
  ] }, Date.now());
  // Assert
  expect(container.querySelectorAll("circle[data-satellite]")).toHaveLength(0);
  expect(container.querySelectorAll(".satellites-bar rect")).toHaveLength(1);
  expect(container.textContent).toContain("20 sig?（不明な信号） 30");
  expect(container.textContent).toContain("解析できない衛星: 1 件");
  expect(container.textContent).toContain("02: 39 dB-Hz");
  expect(container.textContent).toContain("03: 35 dB-Hz");
  expect(container.textContent).toContain("unreliable, display only");
  vi.advanceTimersByTime(6000);
  expect(container.textContent).toContain("衛星の診断は古くなっています");
  expect(container.textContent).toContain("CLAS の診断は古くなっています");
  dispose();
  expect(unsubscribeTopic).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
