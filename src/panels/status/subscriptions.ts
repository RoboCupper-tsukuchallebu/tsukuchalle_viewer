import type { FoxgloveClient } from "../../connection/foxgloveClient.ts";
import type { ChannelBinding } from "../../store/channelBinding.ts";

/** デコード可能なチャネルだけを閲覧用の接続で購読する。 */
export function subscribeAvailable(client: FoxgloveClient, binding: ChannelBinding, topics: readonly string[], render: () => void): () => void {
  const releases = new Map<string, () => void>();
  const update = () => {
    for (const topic of topics) {
      const available = [...client.channels.values()].some((channel) => channel.topic === topic && binding.decoderFor(channel).isDecodable);
      if (available && !releases.has(topic)) {
        releases.set(topic, client.subscribeToTopic(topic));
      }
      if (!available && releases.has(topic)) {
        releases.get(topic)?.();
        releases.delete(topic);
      }
    }
    render();
  };
  const stop = client.on("channelsChanged", update);
  update();
  return () => {
    stop();
    releases.forEach((release) => { release(); });
  };
}
