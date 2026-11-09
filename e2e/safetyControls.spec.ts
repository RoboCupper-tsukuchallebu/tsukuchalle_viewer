import { expect, test } from "@playwright/test";
import { FakeFoxgloveServer } from "../test/support/fakeFoxgloveServer.ts";

test.use({ viewport: { width: 360, height: 740 } });

test("リロード後も書き込みは無効", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-control="write-switch"]').check();
  await expect(page.locator('[data-control="write-switch"]')).toBeChecked();
  await page.reload();
  await expect(page.locator('[data-control="write-switch"]')).not.toBeChecked();
  await expect(page.locator('[data-control="write-switch"]')).toBeEnabled();
  await expect(page.locator(".top-bar")).not.toHaveClass(/write-enabled/);
});

test("閲覧先を変えると書き込み接続を作らない", async ({ page }) => {
  const server = await FakeFoxgloveServer.start();
  try {
    await page.goto(`/?ws=${encodeURIComponent(server.url)}`);
    await expect.poll(() => server.sockets.length).toBe(1);
    await expect(page.locator(".top-bar-connections")).toContainText("書き込み用: なし");
    await page.waitForTimeout(1500);
    expect(server.sockets.length).toBe(1);
  } finally { await server.stop(); }
});

test("既定の書き込み先は /ws-control", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-connection="書き込み用"]')).toContainText("/ws-control");
});
