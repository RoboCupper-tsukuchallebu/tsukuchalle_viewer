// @vitest-environment happy-dom
import { WebSocket as NodeWebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { teleopSpeedParameterNames as names } from "../../src/config.ts";
import { FoxgloveClient } from "../../src/connection/foxgloveClient.ts";
import { WriteGate } from "../../src/control/writeGate.ts";
import type { PanelContext } from "../../src/layout/panelContext.ts";
import { mountPanel } from "../../src/panels/parameters/index.ts";
import { FakeFoxgloveServer, type FakeParameterModel } from "../support/fakeFoxgloveServer.ts";

let server: FakeFoxgloveServer;
let client: FoxgloveClient | undefined;
let writeGate: WriteGate;
let container: HTMLElement;
let disposePanel: (() => void) | undefined;

function robotParameters(limits: { linear: number; angular: number }, current = { linear: 0.6, angular: 1.5 }): FakeParameterModel {
  return {
    values: {
      [names.linear]: current.linear,
      [names.angular]: current.angular,
      [names.linearLimit]: limits.linear,
      [names.angularLimit]: limits.angular,
    },
    writableLimitNames: { [names.linear]: names.linearLimit, [names.angular]: names.angularLimit },
    isResponding: true,
    isRejectingEverything: false,
  };
}

async function waitUntil(predicate: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  // 偽の時計を使う試験があるので、setTimeout と Date は使わない。
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`時間内に満たされませんでした: ${label}`);
}

function sendServerInfo(): void {
  server.sendJson({ op: "serverInfo", name: "fake", capabilities: ["parameters"], supportedEncodings: [], sessionId: "s" });
}

function field(name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-teleop="${name}"]`);
  if (element === null) {
    throw new Error(`要素が無い: ${name}`);
  }
  return element;
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  if (found === undefined) {
    throw new Error(`ボタンが無い: ${label}`);
  }
  return found;
}

function moveSlider(axis: "linear" | "angular", value: number): void {
  const slider = field(`${axis}-slider`) as HTMLInputElement;
  slider.value = String(value);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

const statusLine = (): string => container.querySelector('[role="status"]')?.textContent ?? "";
const setRequests = (): Record<string, unknown>[] => server.jsonReceived("setParameters");
const getRequests = (): Record<string, unknown>[] => server.jsonReceived("getParameters");
const confirmDialog = (): Element | null => document.querySelector('[role="dialog"]');
const clickDialog = (role: "confirm" | "cancel"): void => {
  document.querySelector<HTMLButtonElement>(`[data-role="${role}"]`)?.click();
};

async function mountWithRobot(model = robotParameters({ linear: 1.2, angular: 3 })): Promise<void> {
  server.parameterModel = model;
  client = new FoxgloveClient({
    url: server.url,
    initialReconnectDelayMs: 10,
    maximumReconnectDelayMs: 40,
    createWebSocket: (url, protocols) => new NodeWebSocket(url, protocols) as unknown as WebSocket,
  });
  client.connect();
  await waitUntil(() => client?.state === "connected", "接続");
  sendServerInfo();
  await waitUntil(() => client?.hasCapability("parameters") === true, "serverInfo");
  const context = { connections: { writing: client }, writeGate } as unknown as PanelContext;
  disposePanel = mountPanel(container, context);
}

beforeEach(async () => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
  writeGate = new WriteGate();
  server = await FakeFoxgloveServer.start();
});

afterEach(async () => {
  disposePanel?.();
  disposePanel = undefined;
  client?.close();
  client = undefined;
  vi.useRealTimers();
  await server.stop();
});

describe("偽のサーバーとの試験", () => {
  test("V13: 読む → 変える → 読み戻した値が出る。整数ちょうどの 1.0 も float64 付きで通る", async () => {
    // Arrange
    await mountWithRobot();
    await waitUntil(() => field("linear-current").textContent.includes("0.60 m/s"), "今の値");
    writeGate.enable();

    // Act
    moveSlider("linear", 1.0);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("変えました"), "結果");

    // Assert
    expect(setRequests()).toHaveLength(1);
    expect(setRequests()[0]?.["parameters"]).toEqual([{ name: names.linear, value: 1, type: "float64" }]);
    expect(field("linear-current").textContent).toContain("1.00 m/s");
    expect(field("angular-current").textContent).toContain("1.5 rad/s");
  });

  test("偽のサーバー自身が、型の印の無い値と上限を超える値を拒む", async () => {
    // Arrange
    await mountWithRobot();
    const untypedResponse = new Promise<unknown>((resolve) => client?.on("parameterValues", resolve));

    // Act
    const returned = await client?.setParameters([{ name: names.linear, value: 0.5 }]);
    const overLimit = await client?.setParameters([{ name: names.linear, value: 2, type: "float64" }]);
    void untypedResponse;

    // Assert
    expect(returned).toEqual([{ name: names.linear, value: 0.6, type: "float64" }]);
    expect(overLimit).toEqual([{ name: names.linear, value: 0.6, type: "float64" }]);
  });

  test("V14: ロボットが拒むと「受け付けませんでした」と前の値が出る", async () => {
    // Arrange
    const model = robotParameters({ linear: 1.2, angular: 3 });
    model.isRejectingEverything = true;
    await mountWithRobot(model);
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    writeGate.enable();

    // Act
    moveSlider("linear", 0.4);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("受け付けませんでした"), "結果");

    // Assert
    expect(field("linear-current").textContent).toContain("0.60 m/s");
    expect(statusLine()).toContain("今の値: 0.60 m/s");
    expect((field("linear-slider") as HTMLInputElement).value).toBe("0.4");
  });

  test("V14: 読んだあとにロボットの上限が下がっていて、上限を超える値を拒まれると、受け付けませんでした・前の値・選んだ値が残る", async () => {
    // Arrange
    const model = robotParameters({ linear: 1.2, angular: 3 });
    await mountWithRobot(model);
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    writeGate.enable();
    moveSlider("linear", 1.0);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    model.values[names.linearLimit] = 0.8; // 次の読み直しの前に、ロボットの上限が下がった

    // Act
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("受け付けませんでした"), "結果");

    // Assert
    expect(setRequests()).toHaveLength(1);
    expect(model.values[names.linear]).toBe(0.6);
    expect(statusLine()).toContain("今の値: 0.60 m/s");
    expect(field("linear-current").textContent).toContain("0.60 m/s");
    expect((field("linear-slider") as HTMLInputElement).value).toBe("1");
  });

  test("確認の画面を開いている間に上限が読み直されて変わったら、確認した内容では送らない", async () => {
    // Arrange
    const model = robotParameters({ linear: 1.2, angular: 3 });
    await mountWithRobot(model);
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    writeGate.enable();
    moveSlider("linear", 0.9);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    const readsBefore = getRequests().length;
    model.values[names.linearLimit] = 1.0;
    await waitUntil(() => getRequests().length > readsBefore && field("linear-limit").textContent.includes("1.00"), "読み直し", 4000);

    // Act
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("もう一度確認してください"), "結果");

    // Assert
    expect(setRequests()).toHaveLength(0);
  }, 10_000);

  test("空の返事は受け付けたことにしない。選んだ値は残る", async () => {
    // Arrange
    const model = robotParameters({ linear: 1.2, angular: 3 });
    model.isReturningEmptyListForSet = true;
    await mountWithRobot(model);
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    writeGate.enable();
    moveSlider("linear", 0.4);

    // Act
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("受け付けませんでした"), "結果");

    // Assert
    expect(statusLine()).not.toContain("変えました");
    expect((field("linear-slider") as HTMLInputElement).value).toBe("0.4");
  });

  test("V15: 返事が無いと 12 秒で「応答がありません」", async () => {
    // Arrange
    const model = robotParameters({ linear: 1.2, angular: 3 });
    await mountWithRobot(model);
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    writeGate.enable();
    moveSlider("linear", 0.4);
    model.isResponding = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    // Act
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("confirm");
    await waitUntil(() => setRequests().length === 1, "送信");
    await vi.advanceTimersByTimeAsync(11_999);
    expect(statusLine()).not.toContain("応答がありません");
    await vi.advanceTimersByTimeAsync(2);

    // Assert
    expect(statusLine()).toContain("応答がありません");
    expect((field("linear-slider") as HTMLInputElement).value).toBe("0.4");
  });

  test("V15: 返事を待っている間に切ると「接続が切れました」。V16: つながり直すと読み直す", async () => {
    // Arrange
    const model = robotParameters({ linear: 1.2, angular: 3 });
    await mountWithRobot(model);
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    writeGate.enable();
    moveSlider("linear", 0.4);
    model.isResponding = false;
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("confirm");
    await waitUntil(() => setRequests().length === 1, "送信");

    // Act
    server.dropAllConnections();
    await waitUntil(() => statusLine().includes("接続が切れました。変わったかどうか分かりません"), "切断の表示");
    expect((field("linear-slider") as HTMLInputElement).value).toBe("0.4");
    model.isResponding = true;
    await waitUntil(() => server.sockets.length === 2, "つなぎ直し");
    sendServerInfo();

    // Assert
    await waitUntil(() => getRequests().some((request) => server.received.some((frame) => frame.json === request && frame.connectionIndex === 1)), "つなぎ直したあとの読み直し");
  });
});

describe("画面の試験", () => {
  async function mountReady(): Promise<void> {
    await mountWithRobot();
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
  }

  test("V5: 書き込みのスイッチが無効なら「適用」が押せない。有効にすると押せる", async () => {
    await mountReady();
    moveSlider("linear", 0.4);
    expect(button("適用").disabled).toBe(true);
    expect(field("reason").textContent).toContain("書き込みのスイッチが無効です");
    writeGate.enable();
    expect(button("適用").disabled).toBe(false);
  });

  test("V6: 上限が読めないとき、「適用」が押せず理由が出る", async () => {
    const model = robotParameters({ linear: 1.2, angular: 3 });
    model.values = Object.fromEntries(Object.entries(model.values).filter(([name]) => name !== names.linearLimit));
    await mountWithRobot(model);
    writeGate.enable();
    await waitUntil(() => getRequests().length >= 1, "読み取り");
    await waitUntil(() => field("reason").textContent.includes("上限が読めません"), "理由");
    expect(button("適用").disabled).toBe(true);
  });

  test("V6: 書き込み用の接続が無いとき、使えない理由だけが出る", () => {
    const context = { connections: { writing: null }, writeGate } as unknown as PanelContext;
    disposePanel = mountPanel(container, context);
    writeGate.enable();
    expect(container.textContent).toContain("閲覧先を変えているので、書き込み用の接続がありません。この画面は使えません");
    expect(button("適用").disabled).toBe(true);
  });

  test("V6: 切れているとき・古いとき、「適用」が押せない", async () => {
    await mountReady();
    writeGate.enable();
    moveSlider("linear", 0.4);
    expect(button("適用").disabled).toBe(false);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6000);
    writeGate.disable();
    writeGate.enable();
    expect(button("適用").disabled).toBe(true);
    expect(field("linear-current").textContent).toContain("古い");
    vi.useRealTimers();
    client?.close();
    await waitUntil(() => field("reason").textContent.includes("書き込み用の接続が切れています"), "切断の理由");
    expect(button("適用").disabled).toBe(true);
  });

  test("V7: 確認の画面に前の値と新しい値が出る。大きくするときだけ「今より速くなります」", async () => {
    await mountReady();
    writeGate.enable();
    moveSlider("linear", 0.4);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    expect(confirmDialog()?.textContent).toContain("直進: 0.60 → 0.40 m/s");
    expect(confirmDialog()?.textContent).toContain("走行中でもすぐに反映されます");
    expect(confirmDialog()?.textContent).not.toContain("今より速くなります");
    clickDialog("cancel");
    moveSlider("linear", 0.8);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    expect(confirmDialog()?.textContent).toContain("今より速くなります");
    clickDialog("cancel");
  });

  test("V8: 取り消しでは送らない。Enter キーでは送らない。「変える」で 1 回だけ送る", async () => {
    await mountReady();
    writeGate.enable();
    moveSlider("linear", 0.4);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("cancel");
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    document.querySelector(".confirm-overlay")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(setRequests()).toHaveLength(0);
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("変えました"), "結果");
    expect(setRequests()).toHaveLength(1);
  });

  test("V9: 確認の画面を開いている間にスイッチが無効になったら、「変える」でも送らない", async () => {
    await mountReady();
    writeGate.enable();
    moveSlider("linear", 0.4);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    writeGate.disable();
    clickDialog("confirm");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(setRequests()).toHaveLength(0);
  });

  test("V10: 触ったスライダーは読み直しで戻らない。「元に戻す」で今の値に戻る", async () => {
    await mountReady();
    moveSlider("linear", 0.4);
    const readsBefore = getRequests().length;
    await waitUntil(() => getRequests().length > readsBefore, "次の読み直し");
    expect((field("linear-slider") as HTMLInputElement).value).toBe("0.4");
    button("元に戻す").click();
    expect((field("linear-slider") as HTMLInputElement).value).toBe("0.6");
  }, 10_000);

  test("V11: タブを閉じると、読み直しのタイマーが残らない", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    await mountWithRobot();
    await waitUntil(() => field("linear-current").textContent.includes("0.60"), "今の値");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    disposePanel?.();
    disposePanel = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("V12: localStorage に値を書かない", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await mountReady();
    writeGate.enable();
    moveSlider("linear", 0.4);
    button("適用").click();
    await waitUntil(() => confirmDialog() !== null, "確認の画面");
    clickDialog("confirm");
    await waitUntil(() => statusLine().includes("変えました"), "結果");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});
