import type { ChannelBinding } from "../store/channelBinding.ts";
import type { ViewerConnections } from "../connection/connections.ts";
import type { WriteGate } from "../control/writeGate.ts";
import type { DiagnosticsStore } from "../store/diagnosticsStore.ts";
import type { TopicStore } from "../store/topicStore.ts";

/** パネルに渡すもの。パネルは store だけを読み、書き込みは control を通す。 */
export type PanelContext = {
  connections: ViewerConnections;
  topicStore: TopicStore;
  diagnosticsStore: DiagnosticsStore;
  channelBinding: ChannelBinding;
  writeGate: WriteGate;
};

/** パネルを置き、片付ける関数を返す。 */
export type MountPanel = (container: HTMLElement, context: PanelContext) => () => void;
