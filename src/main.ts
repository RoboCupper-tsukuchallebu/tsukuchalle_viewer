import { topicNames } from "./config.ts";
import { connectAll, createViewerConnections } from "./connection/connections.ts";
import { resolveConnectionUrls } from "./connection/connectionUrls.ts";
import { WriteGate } from "./control/writeGate.ts";
import { createTabs } from "./layout/tabs.ts";
import { createTopBar } from "./layout/topBar.ts";
import { bindClientToTopicStore } from "./store/channelBinding.ts";
import { DiagnosticsStore } from "./store/diagnosticsStore.ts";
import { TopicStore } from "./store/topicStore.ts";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("#app が見つかりません");
}

const connections = createViewerConnections(resolveConnectionUrls(window.location));
const topicStore = new TopicStore();
const diagnosticsStore = new DiagnosticsStore();
diagnosticsStore.attach(topicStore, topicNames.diagnostics);
const channelBinding = bindClientToTopicStore(connections.viewing, topicStore);
// 書き込み用が別の接続のときの message data も同じ store に入れる。
if (connections.writing !== null && connections.writing !== connections.viewing) {
  bindClientToTopicStore(connections.writing, topicStore);
}
// 書き込みのスイッチは、ページを開くたびに無効から始まる。
const writeGate = new WriteGate();

const topBar = createTopBar({ connections, writeGate });
const tabs = createTabs({ connections, topicStore, diagnosticsStore, channelBinding, writeGate });
app.append(topBar.element, tabs.element);

connectAll(connections);
