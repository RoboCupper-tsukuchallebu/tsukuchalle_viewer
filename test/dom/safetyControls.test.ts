// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createViewerConnections } from "../../src/connection/connections.ts";
import { requestConfirmation } from "../../src/control/confirmDialog.ts";
import { WriteGate } from "../../src/control/writeGate.ts";
import { storageKeys } from "../../src/config.ts";
import type { PanelContext } from "../../src/layout/panelContext.ts";
import { createTabs, tabDefinitions } from "../../src/layout/tabs.ts";
import { createTopBar } from "../../src/layout/topBar.ts";
import { bindClientToTopicStore } from "../../src/store/channelBinding.ts";
import { DiagnosticsStore } from "../../src/store/diagnosticsStore.ts";
import { TopicStore } from "../../src/store/topicStore.ts";

function createContext(): PanelContext {
  const connections = createViewerConnections({
    viewingUrl: "ws://viewer.example/ws",
    writingUrl: "ws://viewer.example/ws-control",
    isViewingUrlOverridden: false,
  });
  const topicStore = new TopicStore();
  return {
    connections,
    topicStore,
    diagnosticsStore: new DiagnosticsStore(),
    channelBinding: bindClientToTopicStore(connections.viewing, topicStore),
    writeGate: new WriteGate(),
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("上部バー", () => {
  test("どのタブを開いても、停止・一時停止のボタンと書き込みのスイッチが DOM にある", async () => {
    // Arrange
    const context = createContext();
    const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });
    const tabs = createTabs(context);
    document.body.append(topBar.element, tabs.element);

    for (const definition of tabDefinitions) {
      // Act
      await tabs.select(definition.id);

      // Assert
      for (const control of ["stop", "pause", "write-switch"]) {
        const element = document.querySelector<HTMLElement>(`[data-control="${control}"]`);
        expect(element, `${definition.id} / ${control}`).not.toBeNull();
        expect(element?.hidden).toBe(false);
      }
    }
    tabs.dispose();
  });

  test("書き込みのスイッチは localStorage に有効と書いてあっても、無効から始まる", () => {
    // Arrange
    localStorage.setItem("tsukuchalle-viewer.writeEnabled", "true");
    localStorage.setItem("writeEnabled", "true");
    const context = createContext();

    // Act
    const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });

    // Assert
    expect(context.writeGate.isEnabled).toBe(false);
    expect(topBar.element.querySelector<HTMLInputElement>('[data-control="write-switch"]')?.checked).toBe(false);
  });

  test("処理が登録されるまで停止のボタンは押せず、登録すれば押せて、1 回の操作で呼ばれる", () => {
    // Arrange
    const context = createContext();
    const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });
    const stopButton = topBar.element.querySelector<HTMLButtonElement>('[data-control="stop"]');
    const stopHandler = vi.fn();

    // Act
    const disabledBefore = stopButton?.disabled;
    topBar.setStopHandler(stopHandler);
    stopButton?.click();

    // Assert
    expect(disabledBefore).toBe(true);
    expect(stopButton?.disabled).toBe(false);
    expect(stopHandler).toHaveBeenCalledTimes(1);
  });

  test("上部バーに登録した停止の処理は、どのタブに切り替えても 1 回の操作で呼ばれる", async () => {
    // Arrange
    const context = createContext();
    const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });
    const tabs = createTabs(context);
    document.body.append(topBar.element, tabs.element);
    const stopHandler = vi.fn();
    topBar.setStopHandler(stopHandler);

    for (const definition of tabDefinitions) {
      // Act
      await tabs.select(definition.id);
      document.querySelector<HTMLButtonElement>('[data-control="stop"]')?.click();
    }

    // Assert
    expect(stopHandler).toHaveBeenCalledTimes(tabDefinitions.length);
    tabs.dispose();
  });

  test("閲覧用と書き込み用を別々の行に表示する", () => {
    const context = createContext();
    const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });
    expect(context.connections.writing).not.toBe(context.connections.viewing);
    expect(topBar.element.querySelector('[data-connection="閲覧用"]')?.textContent).toContain("/ws");
    expect(topBar.element.querySelector('[data-connection="書き込み用"]')?.textContent).toContain("/ws-control");
  });

  test("閲覧用の接続先が既定でないときは、書き込み用の接続が無いと出す", () => {
    // Arrange
    const connections = createViewerConnections({ viewingUrl: "ws://localhost:9999/", writingUrl: null, isViewingUrlOverridden: true });

    // Act
    const topBar = createTopBar({ connections, writeGate: new WriteGate() });

    // Assert
    expect(topBar.element.textContent).toContain("書き込み用: なし");
    expect(topBar.element.textContent).toContain("ws://localhost:9999/");
  });
});

describe("タブ", () => {
  test("開いたタブを localStorage に覚え、読めなくても動く", async () => {
    // Arrange
    const context = createContext();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    // Act
    const tabs = createTabs(context);
    await tabs.select("status");

    // Assert
    expect(tabs.element.querySelector('[data-tab="status"]')?.getAttribute("aria-selected")).toBe("true");
    tabs.dispose();
  });

  test("覚えたタブを次に開いたときに選ぶ", async () => {
    // Arrange
    localStorage.setItem(storageKeys.selectedTab, "map");
    const context = createContext();

    // Act
    const tabs = createTabs(context);
    await vi.waitFor(() => {
      expect(tabs.element.querySelector('[data-tab="map"]')?.getAttribute("aria-selected")).toBe("true");
      expect(tabs.element.querySelector(".map-panel")).not.toBeNull();
    });

    // Assert
    tabs.dispose();
  });
});

describe("確認の画面", () => {
  const request = { title: "goal を送る", lines: ["waypoint 3 個"], confirmLabel: "送る" };

  function key(name: string): KeyboardEvent {
    return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  }

  test("Enter キーでは送られず、確認の画面は残る", async () => {
    // Arrange
    let result: boolean | undefined;
    void requestConfirmation(request).then((confirmed) => {
      result = confirmed;
    });
    const overlay = document.querySelector(".confirm-overlay");
    const confirmButton = document.querySelector<HTMLButtonElement>('[data-role="confirm"]');

    // Act
    const enter = key("Enter");
    confirmButton?.dispatchEvent(enter);
    overlay?.dispatchEvent(key("Enter"));
    await Promise.resolve();

    // Assert
    expect(enter.defaultPrevented).toBe(true);
    expect(result).toBeUndefined();
    expect(document.querySelector(".confirm-overlay")).not.toBeNull();
  });

  test("最初の焦点は取り消しにある", () => {
    // Arrange・Act
    void requestConfirmation(request);

    // Assert
    expect(document.activeElement?.getAttribute("data-role")).toBe("cancel");
  });

  test("送るボタンを押したときだけ true になり、画面が消える", async () => {
    // Arrange
    const pending = requestConfirmation(request);

    // Act
    document.querySelector<HTMLButtonElement>('[data-role="confirm"]')?.click();

    // Assert
    await expect(pending).resolves.toBe(true);
    expect(document.querySelector(".confirm-overlay")).toBeNull();
  });

  test("取り消しと Escape は false になる", async () => {
    // Arrange
    const cancelled = requestConfirmation(request);
    document.querySelector<HTMLButtonElement>('[data-role="cancel"]')?.click();
    const escaped = requestConfirmation(request);

    // Act
    document.querySelector(".confirm-overlay")?.dispatchEvent(key("Escape"));

    // Assert
    await expect(cancelled).resolves.toBe(false);
    await expect(escaped).resolves.toBe(false);
  });

  test("注意（実行中の goal を置き換える）を目立たせて出す", () => {
    // Arrange・Act
    void requestConfirmation({ ...request, warnings: ["実行中の goal を打ち切って置き換えます"] });

    // Assert
    expect(document.querySelector(".confirm-warning")?.textContent).toBe("実行中の goal を打ち切って置き換えます");
  });
});

describe("mission の操作", () => {
  test("スイッチが無効なら送れず、有効にすると確認画面に件数と preempt が出る", async () => {
    const { mountPanel } = await import("../../src/panels/waypoints/index.ts");
    const { waypointStore } = await import("../../src/store/waypointStore.ts");
    const context = createContext();
    if (!context.connections.writing) throw new Error("writing missing");
    vi.spyOn(context.connections.writing, "state", "get").mockReturnValue("connected");
    const call = vi.spyOn(context.connections.writing, "callService");
    const container = document.createElement("div"); document.body.append(container);
    const dispose = mountPanel(container, context);
    waypointStore.add(1, 2);
    const send = [...container.querySelectorAll("button")].find((button) => button.textContent === "mission に送信");
    expect(send?.disabled).toBe(true);
    send?.click(); expect(call).not.toHaveBeenCalled();
    context.writeGate.enable(); send?.click();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("1 件");
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("preempt");
    document.querySelector<HTMLButtonElement>('[data-role="cancel"]')?.click();
    expect(call).not.toHaveBeenCalled();
    waypointStore.remove(0); dispose();
  });

  test("承認後に goal と get_result を書き込み接続へ送り、結果を表示する", async () => {
    const { mountPanel } = await import("../../src/panels/waypoints/index.ts");
    const { waypointStore } = await import("../../src/store/waypointStore.ts");
    const { actionRoot } = await import("../../src/control/missionClient.ts");
    const { goalSchema, uuidDefinition, resultResponseSchema, resultResponse } = await import("../fixtures/missionCdr.ts");
    const context = createContext(); const writing = context.connections.writing;
    if (!writing) throw new Error("writing missing");
    vi.spyOn(writing, "state", "get").mockReturnValue("connected");
    const description = (schema: string) => ({ encoding: "cdr", schemaName: "test", schema });
    vi.spyOn(writing, "services", "get").mockReturnValue(new Map([
      [1, { id: 1, name: `${actionRoot}/send_goal`, type: "goal", request: description(goalSchema), response: description("bool accepted") }],
      [2, { id: 2, name: `${actionRoot}/get_result`, type: "result", request: description(uuidDefinition), response: description(resultResponseSchema) }],
    ]));
    const call = vi.spyOn(writing, "callService").mockImplementation((id) => Promise.resolve({ encoding: "cdr", payload: id === 1 ? new Uint8Array([0, 1, 0, 0, 1]) : resultResponse }));
    const viewingCall = vi.spyOn(context.connections.viewing, "callService");
    const container = document.createElement("div"); document.body.append(container);
    const dispose = mountPanel(container, context); waypointStore.add(1, 2); context.writeGate.enable();
    [...container.querySelectorAll("button")].find((button) => button.textContent === "mission に送信")?.click();
    expect(call).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[data-role="confirm"]')?.click();
    await vi.waitFor(() => { expect(call).toHaveBeenCalledTimes(2); });
    await vi.waitFor(() => { expect(container.textContent).toContain("fail"); });
    expect(viewingCall).not.toHaveBeenCalled();
    waypointStore.remove(0); dispose();
  });

  test("書き込みが無効でも停止を送る", async () => {
    const { startMissionControls } = await import("../../src/control/mission.ts");
    const { actionRoot } = await import("../../src/control/missionClient.ts");
    const { cancelSchema, cancelResponseSchema, cancelResponse, cancelRequest } = await import("../fixtures/missionCdr.ts");
    const context = createContext(); const writing = context.connections.writing;
    if (!writing) throw new Error("writing missing");
    vi.spyOn(writing, "state", "get").mockReturnValue("connected");
    vi.spyOn(writing, "services", "get").mockReturnValue(new Map([[1, { id: 1, name: `${actionRoot}/cancel_goal`, type: "action_msgs/srv/CancelGoal", request: { encoding: "cdr", schemaName: "request", schema: cancelSchema }, response: { encoding: "cdr", schemaName: "response", schema: cancelResponseSchema } }]]));
    const call = vi.spyOn(writing, "callService").mockResolvedValue({ encoding: "cdr", payload: cancelResponse });
    const topBar = createTopBar({ connections: context.connections, writeGate: context.writeGate });
    document.body.append(topBar.element); startMissionControls({ topBar, connections: context.connections, writeGate: context.writeGate });
    expect(context.writeGate.isEnabled).toBe(false);
    topBar.element.querySelector<HTMLButtonElement>('[data-control="stop"]')?.click();
    await vi.waitFor(() => { expect(call).toHaveBeenCalledWith(1, cancelRequest); });
    await vi.waitFor(() => { expect(topBar.element.textContent).toContain("取り消す goal がありません"); });
    topBar.dispose();
  });

  test("書き込み接続が null なら送信を使えない", async () => {
    const { mountPanel } = await import("../../src/panels/waypoints/index.ts");
    const { waypointStore } = await import("../../src/store/waypointStore.ts");
    const context = createContext(); context.connections.writing = null; context.writeGate.enable();
    const container = document.createElement("div"); document.body.append(container);
    const dispose = mountPanel(container, context); waypointStore.add(1, 2);
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "mission に送信")?.disabled).toBe(true);
    waypointStore.remove(0); dispose();
  });
});
