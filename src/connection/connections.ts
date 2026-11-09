import type { ConnectionUrls } from "./connectionUrls.ts";
import { FoxgloveClient } from "./foxgloveClient.ts";

/** 画面が持つ 2 つの接続（仕様 4.1 節）。 */
export type ViewerConnections = {
  viewing: FoxgloveClient;
  /** 書き込み用は別の bridge。閲覧先を変更したときは null。 */
  writing: FoxgloveClient | null;
};

export function createViewerConnections(urls: ConnectionUrls): ViewerConnections {
  const viewing = new FoxgloveClient({ url: urls.viewingUrl });
  if (urls.writingUrl === null) {
    return { viewing, writing: null };
  }
  const writing = new FoxgloveClient({ url: urls.writingUrl });
  return { viewing, writing };
}

export function connectAll(connections: ViewerConnections): void {
  connections.viewing.connect();
  if (connections.writing !== null) {
    connections.writing.connect();
  }
}
