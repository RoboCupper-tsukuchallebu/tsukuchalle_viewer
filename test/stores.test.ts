import { describe, expect, test, vi } from "vitest";
import { DiagnosticsStore } from "../src/store/diagnosticsStore.ts";
import { TopicStore } from "../src/store/topicStore.ts";

describe("TopicStore", () => {
  test("最新値と受信時刻を持ち、古さを返す", () => {
    // Arrange
    let nowMs = 1000;
    const store = new TopicStore(() => nowMs);

    // Act
    store.put("/a", { value: 1 }, 5n);
    nowMs = 1750;

    // Assert
    expect(store.get("/a")).toEqual({ topic: "/a", value: { value: 1 }, receivedAtMs: 1000, logTimeNanoseconds: 5n });
    expect(store.ageMs("/a")).toBe(750);
    expect(store.ageMs("/missing")).toBeUndefined();
  });

  test("put で購読者に知らせ、解除したら知らせない", () => {
    // Arrange
    const store = new TopicStore();
    const listener = vi.fn();
    const stop = store.subscribe("/a", listener);

    // Act
    store.put("/a", 1, 0n);
    stop();
    store.put("/a", 2, 0n);

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("デコードの失敗を覚え、次に成功したら消す", () => {
    // Arrange
    const store = new TopicStore();

    // Act・Assert
    store.recordDecodeError("/a", "壊れている");
    expect(store.decodeError("/a")).toBe("壊れている");
    store.put("/a", 1, 0n);
    expect(store.decodeError("/a")).toBeUndefined();
  });
});

describe("DiagnosticsStore", () => {
  const diagnosticArray = {
    status: [
      { level: 0, name: "host: battery", message: "OK", hardware_id: "host", values: [{ key: "percentage", value: "87" }] },
      { level: 2, name: "ma10p_node: receiver", message: "no fix", hardware_id: "", values: [] },
      { level: 1 }, // name が無いものは飛ばす
    ],
  };

  test("name ごとに最新だけを持つ", () => {
    // Arrange
    const store = new DiagnosticsStore();

    // Act
    store.update(diagnosticArray, 100);
    store.update({ status: [{ level: 1, name: "host: battery", message: "low", hardware_id: "host", values: [] }] }, 200);

    // Assert
    expect(store.get("host: battery")).toMatchObject({ level: 1, message: "low", receivedAtMs: 200 });
    expect(store.get("ma10p_node: receiver")).toMatchObject({ level: 2, receivedAtMs: 100 });
    expect(store.all().map((status) => status.name)).toEqual(["host: battery", "ma10p_node: receiver"]);
  });

  test("values を key と value の対にする", () => {
    // Arrange
    const store = new DiagnosticsStore();

    // Act
    store.update(diagnosticArray, 100);

    // Assert
    expect(store.get("host: battery")?.values).toEqual({ percentage: "87" });
  });

  test("形が合わない入力を無視する", () => {
    // Arrange
    const store = new DiagnosticsStore();

    // Act
    store.update(null, 1);
    store.update({ status: "x" }, 1);
    store.update({ status: [{ name: 5 }] }, 1);

    // Assert
    expect(store.all()).toEqual([]);
  });

  test("topicStore の /diagnostics に届いたら更新する", () => {
    // Arrange
    const topicStore = new TopicStore(() => 42);
    const store = new DiagnosticsStore();
    store.attach(topicStore, "/diagnostics");

    // Act
    topicStore.put("/diagnostics", diagnosticArray, 0n);

    // Assert
    expect(store.get("host: battery")?.receivedAtMs).toBe(42);
  });
});
