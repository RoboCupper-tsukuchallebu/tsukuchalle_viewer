import { topicNames } from "../../config.ts";
import type { FoxgloveClient } from "../../connection/foxgloveClient.ts";
import type { TopBar } from "../../layout/topBar.ts";
import type { ChannelBinding } from "../../store/channelBinding.ts";
import type { DiagnosticsStore } from "../../store/diagnosticsStore.ts";
import type { TopicStore } from "../../store/topicStore.ts";
import { localizationSummary } from "./statusData.ts";
import { subscribeAvailable } from "./subscriptions.ts";
import "./status.css";

export type TopBarStatusContext = { topBar: TopBar; topicStore: TopicStore; diagnosticsStore: DiagnosticsStore; viewing: FoxgloveClient; channelBinding: ChannelBinding };

export function startTopBarStatus({ topBar, topicStore, viewing, channelBinding }: TopBarStatusContext): () => void {
  const render = () => {
    const channel = [...viewing.channels.values()].find((item) => item.topic === topicNames.localizationStatus);
    const missingSchema = channel && (channel.encoding === "" || (channel.encoding === "cdr" && !channel.schema));
    const summary = missingSchema ? { text: "自己位置: 型が bridge に無い（lightnav_msgs 未導入）", level: "unknown" } : localizationSummary(topicStore.get(topicNames.localizationStatus));
    topBar.localizationStatusSlot.textContent = summary.text;
    topBar.localizationStatusSlot.dataset["level"] = summary.level;
  };
  const stopTopic = topicStore.subscribe(topicNames.localizationStatus, render);
  const stopSubscription = subscribeAvailable(viewing, channelBinding, [topicNames.localizationStatus], render);
  const timer = setInterval(render, 1000);
  return () => { stopTopic(); stopSubscription(); clearInterval(timer); };
}
