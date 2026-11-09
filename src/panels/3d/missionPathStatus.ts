import { topicNames } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";

export function missionPathReason(context: PanelContext): string {
  const channel = [...context.connections.viewing.channels.values()].find(
    (channelItem) => channelItem.topic === topicNames.missionPath,
  );
  if (!channel) {
    return "走行経路: トピックがありません";
  }
  const decoder = context.channelBinding.decoderFor(channel);
  if (!decoder.isDecodable) {
    return `走行経路: ${decoder.reason}`;
  }
  const error = context.topicStore.decodeError(topicNames.missionPath);
  return error ? `走行経路: ${error}` : "";
}
