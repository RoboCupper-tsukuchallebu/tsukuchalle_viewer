import { expect, it } from "vitest";
import { createDevProxy } from "../../vite.config.ts";

it("閲覧用の中継は書き込み用の経路に一致しない", () => {
  const proxy = createDevProxy("view", "control");
  expect(new RegExp("^/ws$").test("/ws-control")).toBe(false);
  expect(proxy["^/ws$"]?.rewrite()).toBe("/");
});
