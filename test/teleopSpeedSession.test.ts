import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { teleopSpeedParameterNames as names } from "../src/config.ts";
import type { FoxgloveClient } from "../src/connection/foxgloveClient.ts";
import type { Parameter } from "../src/connection/protocol.ts";
import { TeleopSpeedSession } from "../src/panels/parameters/teleopSpeedSession.ts";

const readingParameters: Parameter[] = [
  { name: names.linear, value: 0.6 },
  { name: names.angular, value: 1.5 },
  { name: names.linearLimit, value: 0.9 },
  { name: names.angularLimit, value: 2 },
];

type Deferred = { resolve: (parameters: Parameter[]) => void; promise: Promise<Parameter[]> };

function createDeferred(): Deferred {
  let resolve: (parameters: Parameter[]) => void = () => undefined;
  const promise = new Promise<Parameter[]>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { resolve, promise };
}

type StubClient = { client: FoxgloveClient; getCalls: Deferred[]; setCalls: Deferred[] };

/** getParameters・setParameters の返事を、試験が好きな時に返せる偽の接続。 */
function createStubClient(): StubClient {
  const getCalls: Deferred[] = [];
  const setCalls: Deferred[] = [];
  const client = {
    state: "connected",
    hasCapability: () => true,
    on: () => () => undefined,
    getParameters: () => {
      const deferred = createDeferred();
      getCalls.push(deferred);
      return deferred.promise;
    },
    setParameters: () => {
      const deferred = createDeferred();
      setCalls.push(deferred);
      return deferred.promise;
    },
  } as unknown as FoxgloveClient;
  return { client, getCalls, setCalls };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

async function startedSession(stub: StubClient): Promise<TeleopSpeedSession> {
  const session = new TeleopSpeedSession(stub.client, () => undefined);
  session.start();
  stub.getCalls[0]?.resolve(readingParameters);
  await flush();
  return session;
}

describe("空の返事（ノードが応答せず、ブリッジが空の一覧を返すとき）", () => {
  test("最後に読めた時刻を更新せず、受け付けたことにせず、すぐ読み直す", async () => {
    // Arrange
    const stub = createStubClient();
    const session = await startedSession(stub);
    const readAtMs = session.lastReadAtMs;
    vi.setSystemTime(1_006_000);

    // Act
    const pendingOutcome = session.apply([{ name: names.linear, value: 0.4, type: "float64" }], { linear: 0.4 });
    stub.setCalls[0]?.resolve([]);
    const outcome = await pendingOutcome;
    await flush();

    // Assert
    expect(outcome.acceptedAxes).toEqual([]);
    expect(outcome.isError).toBe(true);
    expect(outcome.messages).toEqual(["直進: ロボットが受け付けませんでした（今の値: 0.60 m/s）"]);
    expect(session.lastReadAtMs).toBe(readAtMs);
    expect(session.reading?.current).toEqual({ linear: 0.6, angular: 1.5 });
    expect(stub.getCalls).toHaveLength(2); // すぐ読み直している
  });

  test("頼んだ名前の値が返ってきたときは、時刻を更新して受け付けたことにする", async () => {
    // Arrange
    const stub = createStubClient();
    const session = await startedSession(stub);
    vi.setSystemTime(1_003_000);

    // Act
    const pendingOutcome = session.apply([{ name: names.linear, value: 0.4, type: "float64" }], { linear: 0.4 });
    stub.setCalls[0]?.resolve([{ name: names.linear, value: 0.4, type: "float64" }]);
    const outcome = await pendingOutcome;

    // Assert
    expect(outcome.acceptedAxes).toEqual(["linear"]);
    expect(session.lastReadAtMs).toBe(1_003_000);
    expect(session.reading?.current.linear).toBe(0.4);
  });
});

describe("読み直しと適用の重なり", () => {
  test("適用の返事を待っている間は、読み直しを送らない", async () => {
    // Arrange
    const stub = createStubClient();
    const session = await startedSession(stub);
    void session.apply([{ name: names.linear, value: 0.4, type: "float64" }], { linear: 0.4 });

    // Act
    await session.readNow();

    // Assert
    expect(stub.getCalls).toHaveLength(1);
  });

  test("適用の前に始まった読み直しの返事は、適用のあとに届いても取り込まない", async () => {
    // Arrange
    const stub = createStubClient();
    const session = await startedSession(stub);
    const pendingRead = session.readNow();
    const pendingOutcome = session.apply([{ name: names.linear, value: 0.4, type: "float64" }], { linear: 0.4 });
    stub.setCalls[0]?.resolve([{ name: names.linear, value: 0.4, type: "float64" }]);
    await pendingOutcome;

    // Act（適用の前の値を持つ読み直しの返事が、あとから届く）
    stub.getCalls[1]?.resolve(readingParameters);
    await pendingRead;

    // Assert
    expect(session.reading?.current.linear).toBe(0.4);
  });
});
