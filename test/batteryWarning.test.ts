import { describe, expect, test } from "vitest";
import { batteryWarning } from "../src/store/batteryWarning.ts";
import type { DiagnosticStatus } from "../src/store/diagnosticsStore.ts";
import type { TopicEntry } from "../src/store/topicStore.ts";

const now = 10000;
const staleAfterMs = 5000;
const battery: DiagnosticStatus = { name: "host: battery", level: 2, message: "4% Discharging", hardwareId: "battery", receivedAtMs: now, values: { capacity_percent: "4", status: "Discharging", ac: "offline", energy_wh: "1", energy_full_wh: "20", energy_full_design_wh: "22", power_w: "5", time_remaining_min: "12", health_percent: "91", cycle_count: "10", voltage_v: "12" } };
const lowBattery: TopicEntry = { topic: "/system/low_battery", value: { data: true }, receivedAtMs: now, logTimeNanoseconds: 0n };

describe("電池警告", () => {
  test("実際のキーを持つ ERROR で残量と放電状態を表示する", () => {
    // Arrange・Act
    const result = batteryWarning(battery, undefined, now, staleAfterMs);
    // Assert
    expect(result).toContain("4% / 放電中");
  });
  test.each([0, 1, 3] as const)("level %i では警告しない", (level) => {
    // Arrange・Act
    const result = batteryWarning({ ...battery, level }, undefined, now, staleAfterMs);
    // Assert
    expect(result).toBeUndefined();
  });
  test("Bool が true なら診断がなくても警告する", () => {
    // Arrange・Act
    const result = batteryWarning(undefined, lowBattery, now, staleAfterMs);
    // Assert
    expect(result).toContain("残量不明");
  });
  test("両入力が警告でないか古い場合は表示しない", () => {
    // Arrange・Act・Assert
    expect(batteryWarning({ ...battery, level: 0 }, { ...lowBattery, value: { data: false } }, now, staleAfterMs)).toBeUndefined();
    expect(batteryWarning(battery, lowBattery, now + staleAfterMs + 1, staleAfterMs)).toBeUndefined();
  });
  test.each(["unknown", "bad", ""]) ("不正な残量 %s は不明と表示する", (capacity) => {
    // Arrange・Act
    const result = batteryWarning({ ...battery, values: { capacity_percent: capacity } }, undefined, now, staleAfterMs);
    // Assert
    expect(result).toContain("残量不明");
  });
  test("残量キーが無いとき message の先頭を使う", () => {
    // Arrange・Act
    const result = batteryWarning({ ...battery, values: {} }, undefined, now, staleAfterMs);
    // Assert
    expect(result).toContain("4%");
  });
  test.each([["Charging", "充電中"], ["Full", "満充電"], ["Not charging", "充電していない"], ["unknown", "充電状態不明"]])("状態 %s を日本語にする", (status, label) => {
    // Arrange・Act
    const result = batteryWarning({ ...battery, values: { status } }, undefined, now, staleAfterMs);
    // Assert
    expect(result).toContain(label);
  });
  test("状態キーが無いとき外部電源の状態を表示する", () => {
    // Arrange・Act
    const result = batteryWarning({ ...battery, values: { ac: "online" } }, undefined, now, staleAfterMs);
    // Assert
    expect(result).toContain("外部電源接続中");
  });
});
