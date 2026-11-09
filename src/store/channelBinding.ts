import { createChannelDecoder, type DecoderResult } from "../decoding/channelDecoder.ts";
import type { FoxgloveClient } from "../connection/foxgloveClient.ts";
import type { Channel } from "../connection/protocol.ts";
import type { TopicStore } from "./topicStore.ts";

export type ChannelBinding = {
  /** チャネルごとのデコード可否（一覧の画面が読む）。 */
  decoderFor(channel: Channel): DecoderResult;
  dispose(): void;
};

/** 接続が受け取ったメッセージを、チャネルの encoding に合わせてデコードして topicStore に入れる。 */
export function bindClientToTopicStore(client: FoxgloveClient, topicStore: TopicStore): ChannelBinding {
  const decoderByChannelId = new Map<number, DecoderResult>();

  const decoderFor = (channel: Channel): DecoderResult => {
    const known = decoderByChannelId.get(channel.id);
    if (known) {
      return known;
    }
    const created = createChannelDecoder(channel);
    decoderByChannelId.set(channel.id, created);
    return created;
  };

  const stopChannels = client.on("channelsChanged", (channels) => {
    for (const channelId of decoderByChannelId.keys()) {
      if (!channels.has(channelId)) {
        decoderByChannelId.delete(channelId);
      }
    }
  });

  const stopMessages = client.on("message", (message) => {
    const channel = client.channels.get(message.channelId);
    if (!channel) {
      return;
    }
    const decoder = decoderFor(channel);
    if (!decoder.isDecodable) {
      topicStore.recordDecodeError(message.topic, decoder.reason);
      return;
    }
    try {
      topicStore.put(message.topic, decoder.decode(message.payload), message.logTimeNanoseconds);
    } catch (error) {
      topicStore.recordDecodeError(message.topic, error instanceof Error ? error.message : String(error));
    }
  });

  return {
    decoderFor,
    dispose: () => {
      stopChannels();
      stopMessages();
    },
  };
}
