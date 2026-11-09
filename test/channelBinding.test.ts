import { expect, it, vi } from "vitest";
import fixtures from "./fixtures/rosMessages.json";
import { FoxgloveClient, type TopicMessage } from "../src/connection/foxgloveClient.ts";
import type { Channel } from "../src/connection/protocol.ts";
import { bindClientToTopicStore } from "../src/store/channelBinding.ts";
import { TopicStore } from "../src/store/topicStore.ts";

class FakeClient extends FoxgloveClient {
  readonly fakeChannels = new Map<number, Channel>();
  constructor() {
    super({ url: "" });
  }
  override get channels(): ReadonlyMap<number, Channel> {
    return this.fakeChannels;
  }
  deliver(message: TopicMessage): void {
    this.emit("message", message);
  }
}

it("点群は生のメッセージだけを配り、odom は store にデコードする", () => {
  const client = new FakeClient();
  const store = new TopicStore();
  const binding = bindClientToTopicStore(client, store);
  const rawListener = vi.fn();
  client.on("message", rawListener);
  client.fakeChannels.set(1, {
    id: 1,
    topic: "/cloud",
    encoding: "cdr",
    schemaName: "sensor_msgs/msg/PointCloud2",
    schema: fixtures.pointCloudXyz.schema,
  });
  client.fakeChannels.set(2, {
    id: 2,
    topic: "/odom",
    encoding: "cdr",
    schemaName: "nav_msgs/msg/Odometry",
    schema: fixtures.odometry.schema,
  });
  client.fakeChannels.set(3, { id: 3, topic: "/bad", encoding: "invalid", schemaName: "bad", schema: "" });
  const cloudMessage = {
    topic: "/cloud",
    channelId: 1,
    logTimeNanoseconds: 0n,
    payload: Uint8Array.from(Buffer.from(fixtures.pointCloudXyz.hex, "hex")),
  };
  client.deliver(cloudMessage);
  client.deliver({
    topic: "/odom",
    channelId: 2,
    logTimeNanoseconds: 0n,
    payload: Uint8Array.from(Buffer.from(fixtures.odometry.hex, "hex")),
  });
  client.deliver({ topic: "/bad", channelId: 3, logTimeNanoseconds: 0n, payload: new Uint8Array() });
  expect(store.get("/cloud")).toBeUndefined();
  expect(rawListener).toHaveBeenCalledWith(cloudMessage);
  expect(store.get("/odom")?.value).toBeDefined();
  expect(store.decodeError("/bad")).toBeDefined();
  binding.dispose();
});
