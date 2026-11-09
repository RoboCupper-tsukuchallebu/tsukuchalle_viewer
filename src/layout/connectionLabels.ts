import type { ConnectionState } from "../connection/foxgloveClient.ts";

export const connectionStateLabels: Record<ConnectionState, string> = {
  idle: "未接続",
  connecting: "接続中",
  connected: "接続済み",
  reconnecting: "つなぎ直し中",
  closed: "切断",
};
