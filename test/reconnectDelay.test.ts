import { expect, test } from "vitest";
import { reconnectDelayMs } from "../src/connection/reconnectDelay.ts";

test("再接続の間隔は 1 秒から倍々に延び、最大 10 秒", () => {
  // Arrange・Act
  const delays = [0, 1, 2, 3, 4, 5, 20].map((attempt) => reconnectDelayMs(attempt));

  // Assert
  expect(delays).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000, 10_000]);
});
