import { createChannelDecoder, type EncodedChannel } from "./channelDecoder.ts";
import { extractPointCloud, type PointCloudMessage } from "./pointCloud.ts";

export type PointCloudRequest = { channel: EncodedChannel; payload: Uint8Array; maximumPoints: number };
export type PointCloudResponse = { result: ReturnType<typeof extractPointCloud>; frame: string } | { error: string };

self.onmessage = (event: MessageEvent<PointCloudRequest>) => {
  try {
    const decoder = createChannelDecoder(event.data.channel);
    if (!decoder.isDecodable) throw new Error(decoder.reason);
    const message = decoder.decode(event.data.payload) as PointCloudMessage & { header: { frame_id: string } };
    const result = extractPointCloud(message, event.data.maximumPoints);
    self.postMessage({ result, frame: message.header.frame_id }, { transfer: [result.points.buffer, result.colors.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
