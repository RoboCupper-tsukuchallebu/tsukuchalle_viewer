// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import * as leaflet from "leaflet";
import { createViewerConnections } from "../../src/connection/connections.ts";
import { WriteGate } from "../../src/control/writeGate.ts";
import { mountPanel } from "../../src/panels/map/index.ts";
import { bindClientToTopicStore } from "../../src/store/channelBinding.ts";
import { DiagnosticsStore } from "../../src/store/diagnosticsStore.ts";
import { TopicStore } from "../../src/store/topicStore.ts";

it("出典を背景に応じて変え、終了時に購読と地図とリスナーを片付ける", () => {
  // Arrange
  const connections = createViewerConnections({ viewingUrl: "ws://viewer.example/ws", writingUrl: null, isViewingUrlOverridden: true });
  const topicStore = new TopicStore();
  const release = vi.fn();
  const subscribe = vi.spyOn(connections.viewing, "subscribeToTopic").mockReturnValue(release);
  const remove = vi.spyOn(leaflet.Map.prototype, "remove");
  const removeListener = vi.spyOn(window, "removeEventListener");
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = mountPanel(container, { connections, topicStore, channelBinding: bindClientToTopicStore(connections.viewing, topicStore), diagnosticsStore: new DiagnosticsStore(), writeGate: new WriteGate() });
  const select = container.querySelector("select");
  expect(container.querySelector(".map-attribution")?.textContent).toBe("出典: 地理院タイル");
  // Act
  if (!select) throw new Error("背景の選択がない");
  select.value = "osm";
  select.dispatchEvent(new Event("change"));
  // Assert
  expect(container.querySelector(".map-attribution")?.textContent).toBe("© OpenStreetMap contributors");
  expect(container.querySelector<HTMLAnchorElement>(".map-attribution")?.href).toBe("https://www.openstreetmap.org/copyright");
  dispose();
  expect(subscribe).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
  vi.restoreAllMocks();
});
