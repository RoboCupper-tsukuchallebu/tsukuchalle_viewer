import { expect, test } from "@playwright/test";
import { FakeFoxgloveServer } from "../test/support/fakeFoxgloveServer.ts";
import { buildMessageDataFrame } from "../test/support/frames.ts";
import { diagnosticBytes, diagnosticSchema } from "../test/support/diagnosticFixture.ts";

test("幅 360 px で衛星を表示し停止操作を見せる", async ({ page }) => {
  // Arrange
  const server = await FakeFoxgloveServer.start();
  try {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.addInitScript(() => { localStorage.setItem("tsukuchalle-viewer.selectedTab", "satellites"); });
    await page.goto(`/?ws=${encodeURIComponent(server.url)}`);
    await expect.poll(() => server.sockets.length).toBe(1);
    server.sendJson({ op: "advertise", channels: [{ id: 7, topic: "/diagnostics", encoding: "cdr", schemaName: "diagnostic_msgs/msg/DiagnosticArray", schemaEncoding: "ros2msg", schema: diagnosticSchema }] });
    await expect.poll(() => server.jsonReceived("subscribe").length).toBeGreaterThan(0);
    const subscriptions = server.jsonReceived("subscribe").flatMap((message) => message["subscriptions"] as { id: number; channelId: number }[]);
    const subscription = subscriptions.find((item) => item.channelId === 7);
    if (!subscription) throw new Error("診断の購読がない");
    // Act
    server.sendBinary(buildMessageDataFrame(subscription.id, 0n, diagnosticBytes()));
    // Assert
    await expect(page.locator('svg[aria-label="衛星のスカイプロット"] circle[data-satellite]')).toHaveCount(9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const control of ["stop", "pause"]) await expect(page.locator(`[data-control="${control}"]`)).toBeInViewport({ ratio: 1 });
  } finally {
    await server.stop();
  }
});
