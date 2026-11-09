import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { vi } from "vitest";
import { FoxgloveClient, type TopicMessage } from "../src/connection/foxgloveClient.ts";
import { FakeFoxgloveServer, sampleChannel } from "./support/fakeFoxgloveServer.ts";
import { buildMessageDataFrame, buildServiceCallResponseFrame, parseServiceCallRequestFrame } from "./support/frames.ts";

const fastReconnect = { initialReconnectDelayMs: 10, maximumReconnectDelayMs: 40 };

let server: FakeFoxgloveServer;
let client: FoxgloveClient;

async function connectClient(): Promise<void> {
  client = new FoxgloveClient({ url: server.url, ...fastReconnect });
  client.connect();
  await vi.waitFor(() => {
    expect(client.state).toBe("connected");
  });
}

function sendServerInfo(capabilities: string[]): void {
  server.sendJson({ op: "serverInfo", name: "fake", capabilities, supportedEncodings: ["cdr"], sessionId: "s1" });
}

beforeEach(async () => {
  server = await FakeFoxgloveServer.start();
});

afterEach(async () => {
  client.close();
  await server.stop();
});

describe("接続", () => {
  test("副プロトコルとして foxglove.sdk.v1 だけを申し出る", async () => {
    // Arrange・Act
    await connectClient();

    // Assert
    expect(server.offeredProtocolHeaders).toEqual(["foxglove.sdk.v1"]);
  });

  test("サーバーが foxglove.sdk.v1 を受けなければ、つながらずに再試行を続ける", async () => {
    // Arrange
    await server.stop();
    server = await FakeFoxgloveServer.start("foxglove.websocket.v1");
    const states: string[] = [];

    // Act
    client = new FoxgloveClient({ url: server.url, ...fastReconnect });
    client.on("stateChanged", (state) => states.push(state));
    client.connect();
    await vi.waitFor(() => {
      expect(states).toContain("reconnecting");
    });

    // Assert
    expect(states).not.toContain("connected");
    expect(server.sockets).toHaveLength(0);
  });

  test("serverInfo の capabilities を持つ", async () => {
    // Arrange
    await connectClient();

    // Act
    sendServerInfo(["services", "parameters"]);
    await vi.waitFor(() => {
      expect(client.serverInfo?.capabilities).toEqual(["services", "parameters"]);
    });

    // Assert
    expect(client.hasCapability("services")).toBe(true);
    expect(client.hasCapability("clientPublish")).toBe(false);
  });

  test("close() のあとはつなぎ直さない", async () => {
    // Arrange
    await connectClient();

    // Act
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(client.state).toBe("closed");
    expect(server.sockets).toHaveLength(1);
  });

  test("知らない op と壊れた JSON は捨てる", async () => {
    // Arrange
    await connectClient();
    const received: TopicMessage[] = [];
    client.on("message", (message) => received.push(message));
    client.subscribeToTopic(sampleChannel.topic);

    // Act
    server.sendJson({ op: "fetchAssetResponse", requestId: 1 });
    server.latestSocket.send("{not json");
    server.sendJson({ op: "advertise", channels: [sampleChannel] });
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribe")).toHaveLength(1);
    });

    // Assert
    expect(client.state).toBe("connected");
    expect(client.channels.size).toBe(1);
  });
});

describe("トピックの購読", () => {
  test("advertise された名前を購読し、message data を受け取る", async () => {
    // Arrange
    await connectClient();
    const received: TopicMessage[] = [];
    client.on("message", (message) => received.push(message));
    server.sendJson({ op: "advertise", channels: [sampleChannel] });
    await vi.waitFor(() => {
      expect(client.channels.size).toBe(1);
    });

    // Act
    client.subscribeToTopic("/example");
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribe")).toHaveLength(1);
    });
    const subscription = (server.jsonReceived("subscribe")[0]?.["subscriptions"] as { id: number; channelId: number }[])[0];
    server.sendBinary(buildMessageDataFrame(subscription?.id ?? -1, 123_456_789_012n, Buffer.from('{"x":1}')));
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    // Assert
    expect(subscription?.channelId).toBe(sampleChannel.id);
    expect(received[0]?.topic).toBe("/example");
    expect(received[0]?.logTimeNanoseconds).toBe(123_456_789_012n);
    expect(Buffer.from(received[0]?.payload ?? []).toString()).toBe('{"x":1}');
  });

  test("購読してから advertise が来ても購読する", async () => {
    // Arrange
    await connectClient();
    client.subscribeToTopic("/example");

    // Act
    server.sendJson({ op: "advertise", channels: [sampleChannel] });

    // Assert
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribe")).toHaveLength(1);
    });
  });

  test("切れてつなぎ直したら、チャネル ID が変わっていても名前で購読し直す", async () => {
    // Arrange
    await connectClient();
    server.sendJson({ op: "advertise", channels: [sampleChannel] });
    client.subscribeToTopic("/example");
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribe", 0)).toHaveLength(1);
    });

    // Act
    server.dropAllConnections();
    await vi.waitFor(() => {
      expect(server.sockets).toHaveLength(2);
      expect(client.state).toBe("connected");
    });
    server.sendJson({ op: "advertise", channels: [{ ...sampleChannel, id: 42 }] });
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribe", 1)).toHaveLength(1);
    });

    // Assert
    const resubscription = (server.jsonReceived("subscribe", 1)[0]?.["subscriptions"] as { channelId: number }[])[0];
    expect(resubscription?.channelId).toBe(42);
  });

  test("unsubscribeFromTopic は unsubscribe を送り、つなぎ直しても購読しない", async () => {
    // Arrange
    await connectClient();
    server.sendJson({ op: "advertise", channels: [sampleChannel] });
    client.subscribeToTopic("/example");
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribe")).toHaveLength(1);
    });

    // Act
    client.unsubscribeFromTopic("/example");
    await vi.waitFor(() => {
      expect(server.jsonReceived("unsubscribe")).toHaveLength(1);
    });
    server.dropAllConnections();
    await vi.waitFor(() => {
      expect(server.sockets).toHaveLength(2);
    });
    server.sendJson({ op: "advertise", channels: [sampleChannel] });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert
    expect(server.jsonReceived("subscribe", 1)).toHaveLength(0);
  });

  test("再接続の間隔は延びていき、上限で止まる", async () => {
    // Arrange: だれも待ち受けていない URL。試行ごとの時刻を記録する。
    const unreachableUrl = server.url;
    await server.stop();
    const attemptTimes: number[] = [];

    // Act
    client = new FoxgloveClient({
      url: unreachableUrl,
      initialReconnectDelayMs: 20,
      maximumReconnectDelayMs: 60,
      createWebSocket: (url, protocols) => {
        attemptTimes.push(performance.now());
        return new WebSocket(url, protocols);
      },
    });
    client.connect();
    await vi.waitFor(() => {
      expect(attemptTimes.length).toBeGreaterThanOrEqual(6);
    }, { timeout: 3000 });

    // Assert: 期待する待ち時間は 20, 40, 60, 60, 60 ms（接続の失敗にかかる時間が上乗せされる）
    const gaps = attemptTimes.slice(1).map((time, index) => time - (attemptTimes[index] ?? 0));
    expect(gaps[0]).toBeGreaterThanOrEqual(18);
    expect(gaps[1]).toBeGreaterThanOrEqual(38);
    expect(gaps[2]).toBeGreaterThanOrEqual(58);
    expect(gaps[4]).toBeLessThan(58 + 200);
    server = await FakeFoxgloveServer.start();
  });
});

describe("サービス呼び出し", () => {
  test("cdr で要求を送り、応答を callId で受け取る", async () => {
    // Arrange
    await connectClient();

    // Act
    const pending = client.callService(5, Uint8Array.from([1, 2, 3]));
    await vi.waitFor(() => {
      expect(server.binaryReceived()).toHaveLength(1);
    });
    const request = parseServiceCallRequestFrame(server.binaryReceived()[0] ?? Buffer.alloc(0));
    server.sendBinary(buildServiceCallResponseFrame(request.serviceId, request.callId, "cdr", Buffer.from([9, 8])));
    const response = await pending;

    // Assert
    expect(request).toMatchObject({ serviceId: 5, encoding: "cdr" });
    expect([...request.payload]).toEqual([1, 2, 3]);
    expect(response.encoding).toBe("cdr");
    expect([...response.payload]).toEqual([9, 8]);
  });

  test("serviceCallFailure は reject になる", async () => {
    // Arrange
    await connectClient();
    const pending = client.callService(5, new Uint8Array());
    const rejection = expect(pending).rejects.toThrow("サービスが無い");
    await vi.waitFor(() => {
      expect(server.binaryReceived()).toHaveLength(1);
    });
    const request = parseServiceCallRequestFrame(server.binaryReceived()[0] ?? Buffer.alloc(0));

    // Act
    server.sendJson({ op: "serviceCallFailure", serviceId: 5, callId: request.callId, message: "サービスが無い" });

    // Assert
    await rejection;
  });

  test("切断で、待っているサービス呼び出しとパラメータの要求がすべて失敗になる", async () => {
    // Arrange
    await connectClient();
    const pendingCall = client.callService(5, new Uint8Array());
    const pendingParameters = client.getParameters(["a"]);
    const rejections = Promise.all([
      expect(pendingCall).rejects.toThrow("disconnected"),
      expect(pendingParameters).rejects.toThrow("disconnected"),
    ]);
    await vi.waitFor(() => {
      expect(server.binaryReceived()).toHaveLength(1);
      expect(server.jsonReceived("getParameters")).toHaveLength(1);
    });

    // Act
    server.dropAllConnections();

    // Assert
    await rejections;
  });

  test("つながっていないときの呼び出しは、送らずにすぐ失敗になる", async () => {
    // Arrange
    client = new FoxgloveClient({ url: server.url, ...fastReconnect });

    // Act・Assert
    await expect(client.callService(1, new Uint8Array())).rejects.toThrow("disconnected");
  });
});

describe("パラメータと接続グラフ", () => {
  test("getParameters は id で返事を対応づける", async () => {
    // Arrange
    await connectClient();

    // Act
    const pending = client.getParameters(["speed"]);
    await vi.waitFor(() => {
      expect(server.jsonReceived("getParameters")).toHaveLength(1);
    });
    const request = server.jsonReceived("getParameters")[0];
    server.sendJson({ op: "parameterValues", id: request?.["id"], parameters: [{ name: "speed", value: 1.5, type: "float64" }] });

    // Assert
    expect(request?.["parameterNames"]).toEqual(["speed"]);
    await expect(pending).resolves.toEqual([{ name: "speed", value: 1.5, type: "float64" }]);
  });

  test("setParameters は型つきの値をそのまま送る", async () => {
    // Arrange
    await connectClient();

    // Act
    const pending = client.setParameters([{ name: "speed", value: 1, type: "float64" }]);
    await vi.waitFor(() => {
      expect(server.jsonReceived("setParameters")).toHaveLength(1);
    });
    const request = server.jsonReceived("setParameters")[0];
    server.sendJson({ op: "parameterValues", id: request?.["id"], parameters: [{ name: "speed", value: 1, type: "float64" }] });
    await pending;

    // Assert
    expect(request?.["parameters"]).toEqual([{ name: "speed", value: 1, type: "float64" }]);
  });

  test("id の無い parameterValues は購読している更新として届く", async () => {
    // Arrange
    await connectClient();
    const updates: unknown[] = [];
    client.on("parameterValues", (parameters) => updates.push(parameters));

    // Act
    client.subscribeParameterUpdates(["speed"]);
    server.sendJson({ op: "parameterValues", parameters: [{ name: "speed", value: 2 }] });
    await vi.waitFor(() => {
      expect(updates).toHaveLength(1);
    });

    // Assert
    expect(server.jsonReceived("subscribeParameterUpdates")[0]?.["parameterNames"]).toEqual(["speed"]);
  });

  test("接続グラフの購読と、つなぎ直し後の購読し直し", async () => {
    // Arrange
    await connectClient();
    client.subscribeConnectionGraph();
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribeConnectionGraph", 0)).toHaveLength(1);
    });

    // Act
    server.dropAllConnections();

    // Assert
    await vi.waitFor(() => {
      expect(server.jsonReceived("subscribeConnectionGraph", 1)).toHaveLength(1);
    });
  });

  test("advertiseServices と unadvertiseServices を反映する", async () => {
    // Arrange
    await connectClient();
    const service = {
      id: 3,
      name: "/lightnav/mission/pause",
      type: "std_srvs/srv/Trigger",
      request: { encoding: "cdr", schemaName: "std_srvs/srv/Trigger_Request", schemaEncoding: "ros2msg", schema: "" },
      response: { encoding: "cdr", schemaName: "std_srvs/srv/Trigger_Response", schemaEncoding: "ros2msg", schema: "bool success" },
    };

    // Act
    server.sendJson({ op: "advertiseServices", services: [service] });
    await vi.waitFor(() => {
      expect(client.services.size).toBe(1);
    });
    server.sendJson({ op: "unadvertiseServices", serviceIds: [3] });

    // Assert
    await vi.waitFor(() => {
      expect(client.services.size).toBe(0);
    });
  });
});
