import type { ConnectionUrls } from "./connectionUrls.ts";
import { FoxgloveClient } from "./foxgloveClient.ts";

/** 画面が持つ 2 つの接続（仕様 4.1 節）。 */
export type ViewerConnections = {
  viewing: FoxgloveClient;
  /**
   * 書き込み用。閲覧用と同じ URL のときは同じ client（案 A）。
   * 閲覧用の接続先が既定から変えられているときは null（書き込みは使えない）。
   * 別の bridge（案 B の /ws-control）にするのは PR 7。
   */
  writing: FoxgloveClient | null;
};

export function createViewerConnections(urls: ConnectionUrls): ViewerConnections {
  const viewing = new FoxgloveClient({ url: urls.viewingUrl });
  if (urls.writingUrl === null) {
    return { viewing, writing: null };
  }
  const writing = urls.writingUrl === urls.viewingUrl ? viewing : new FoxgloveClient({ url: urls.writingUrl });
  return { viewing, writing };
}

export function connectAll(connections: ViewerConnections): void {
  connections.viewing.connect();
  if (connections.writing !== null && connections.writing !== connections.viewing) {
    connections.writing.connect();
  }
}
