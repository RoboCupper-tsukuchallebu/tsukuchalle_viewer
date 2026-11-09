import type { TopBar } from "../../layout/topBar.ts";
import type { DiagnosticsStore } from "../../store/diagnosticsStore.ts";
import type { TopicStore } from "../../store/topicStore.ts";

export type TopBarStatusContext = {
  topBar: TopBar;
  topicStore: TopicStore;
  diagnosticsStore: DiagnosticsStore;
};

/**
 * ページを開いたときに 1 回だけ呼ばれる。PR 3 がここを埋める（このフォルダは PR 3 の持ち物）。
 * 自己位置推定の状態を topBar.localizationStatusSlot に出す。状態のタブを閉じていても出し続けるため、パネルではなくここで行う。
 */
export function startTopBarStatus(_context: TopBarStatusContext): void {
  // PR 1 では何もしない。
}
