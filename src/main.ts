import { topicNames } from "./config.ts";
import { connectAll, createViewerConnections } from "./connection/connections.ts";
import { resolveConnectionUrls } from "./connection/connectionUrls.ts";
import { startMissionControls } from "./control/mission.ts";
import { WriteGate } from "./control/writeGate.ts";
import { createTabs } from "./layout/tabs.ts";
import { createTopBar } from "./layout/topBar.ts";
import { startTopBarStatus } from "./panels/status/topBarStatus.ts";
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
if (connections.writing !== null) {
  bindClientToTopicStore(connections.writing, topicStore);
}
// 書き込みのスイッチは、ページを開くたびに無効から始まる。
const writeGate = new WriteGate();

const topBar = createTopBar({ connections, writeGate });
const tabs = createTabs({ connections, topicStore, diagnosticsStore, channelBinding, writeGate });
app.append(topBar.element, tabs.element);

// 上部バーに出すもの・登録するものは、タブを閉じても動き続ける必要があるので、パネルではなく起動時に 1 回つなぐ。
startTopBarStatus({ topBar, topicStore, diagnosticsStore, viewing: connections.viewing, channelBinding });
startMissionControls({ topBar, connections, writeGate });

connectAll(connections);
