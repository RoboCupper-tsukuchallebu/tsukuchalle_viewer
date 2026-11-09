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
    writingUrl: "ws://viewer.example/ws",
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
      expect(tabs.element.querySelector(".placeholder")).not.toBeNull();
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
