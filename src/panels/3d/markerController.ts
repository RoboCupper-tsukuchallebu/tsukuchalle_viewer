import type { Scene } from "three";
import type { PanelContext } from "../../layout/panelContext.ts";
import { createMarkerLayer } from "./markerLayer.ts";
import type { TransformTree } from "./transformTree.ts";
import { isRecord } from "./valueGuards.ts";

type PendingEvent = { value: unknown; time: number };
type ActiveTopic = {
  release: () => void;
  layer: ReturnType<typeof createMarkerLayer>;
  pending: Map<string, PendingEvent>;
};

export function createMarkerController(
  root: HTMLElement,
  scene: Scene,
  context: PanelContext,
  tree: TransformTree,
  selectedFrame: () => string,
  report: (key: string, reason: string) => void,
) {
  const container = document.createElement("fieldset");
  container.style.cssText = "min-width:0;max-width:100%;overflow-wrap:anywhere";
  const legend = document.createElement("legend");
  legend.textContent = "MarkerArray";
  container.append(legend);
  root.append(container);
  const client = context.connections.viewing;
  const enabled = new Map<string, boolean>();
  const active = new Map<string, ActiveTopic>();

  function reportFrames(): void {
    const frames = new Set<string>();
    for (const topic of active.values()) {
      for (const frame of topic.layer.refresh(Date.now())) frames.add(frame);
    }
    report("markers", frames.size ? `表示できない marker のフレーム: ${[...frames].join(", ")}` : "");
  }
  function stop(topic: string): void {
    const item = active.get(topic);
    if (!item) return;
    item.release();
    item.layer.clear();
    active.delete(topic);
    reportFrames();
  }
  function start(topic: string): void {
    if (active.has(topic)) return;
    const layer = createMarkerLayer(scene, tree, selectedFrame);
    const pending = new Map<string, PendingEvent>();
    const releaseClient = client.subscribeToTopic(topic);
    const releaseStore = context.topicStore.subscribe(topic, (entry) => {
      if (!isRecord(entry.value) || !Array.isArray(entry.value.markers)) return;
      for (const marker of entry.value.markers) {
        if (!isRecord(marker)) continue;
        const event = { value: { markers: [marker] }, time: entry.receivedAtMs };
        if (marker.action === 3) {
          pending.clear();
          pending.set("clear", event);
        } else if (typeof marker.ns === "string" && typeof marker.id === "number") {
          pending.set(JSON.stringify([marker.ns, marker.id]), event);
        }
      }
    });
    active.set(topic, {
      layer,
      pending,
      release: () => {
        releaseClient();
        releaseStore();
      },
    });
  }
  function updateTopics(): void {
    const topics = [...new Set([...client.channels.values()]
      .filter((channel) => channel.schemaName === "visualization_msgs/msg/MarkerArray" ||
        channel.schemaName === "visualization_msgs/MarkerArray")
      .map((channel) => channel.topic))].sort();
    for (const topic of active.keys()) {
      if (!topics.includes(topic)) stop(topic);
    }
    container.replaceChildren(legend);
    for (const topic of topics) {
      if (!enabled.has(topic)) enabled.set(topic, topic === "/lightnav/controller/arc_candidates");
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:.4em;min-width:0;overflow-wrap:anywhere";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = enabled.get(topic) ?? false;
      input.addEventListener("change", () => {
        enabled.set(topic, input.checked);
        if (input.checked) start(topic);
        else stop(topic);
      });
      const text = document.createElement("span");
      text.textContent = topic;
      label.append(input, text);
      container.append(label);
      if (input.checked) start(topic);
    }
  }
  const releaseChannels = client.on("channelsChanged", updateTopics);
  updateTopics();
  const timer = setInterval(() => {
    for (const item of active.values()) {
      for (const event of item.pending.values()) item.layer.update(event.value, event.time);
      item.pending.clear();
    }
    reportFrames();
  }, 100);
  return () => {
    clearInterval(timer);
    releaseChannels();
    for (const topic of active.keys()) stop(topic);
    container.remove();
  };
}
