import type { ViewerConnections } from "../connection/connections.ts";
import type { TopBar } from "../layout/topBar.ts";
import type { WriteGate } from "./writeGate.ts";

export type MissionControlsContext = {
  topBar: TopBar;
  connections: ViewerConnections;
  writeGate: WriteGate;
};

/**
 * ページを開いたときに 1 回だけ呼ばれる。PR 7 がここを埋める（このファイルは PR 7 の持ち物）。
 * 停止・一時停止の処理を topBar.setStopHandler / setPauseHandler に登録する。
 * タブのパネルは開いている間だけ動くので、どの画面からでも届くよう、パネルではなくここで登録する。
 */
export function startMissionControls(_context: MissionControlsContext): void {
  // PR 1 では何もしない。
}
