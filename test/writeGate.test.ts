import { expect, test, vi } from "vitest";
import { WriteGate } from "../src/control/writeGate.ts";

test("既定は無効で、有効・無効の変化だけを知らせる", () => {
  // Arrange
  const gate = new WriteGate();
  const listener = vi.fn();
  gate.subscribe(listener);

  // Act
  const initial = gate.isEnabled;
  gate.enable();
  gate.enable();
  gate.disable();

  // Assert
  expect(initial).toBe(false);
  expect(listener.mock.calls).toEqual([[true], [false]]);
});
