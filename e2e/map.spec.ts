import { expect, test } from "@playwright/test";
import { FakeFoxgloveServer } from "../test/support/fakeFoxgloveServer.ts";
import { navSatFixBytes, navSatFixSchema } from "../test/fixtures/navSatFix.ts";

test.use({ viewport: { width: 360, height: 740 } });

test("合成 fix を受信しタイル失敗時に格子を表示する", async ({ page }) => {
  // Arrange
  const server = await FakeFoxgloveServer.start();
  try {
    await page.route(/cyberjapandata\.gsi\.go\.jp|tile\.openstreetmap\.org/, (route) => route.abort());
    await page.goto(`/?ws=${encodeURIComponent(server.url)}`);
    await page.getByRole("tab", { name: "地図" }).click();
    await expect.poll(() => server.sockets.length).toBe(1);
    server.sendJson({ op: "advertise", channels: ["/rtk/fix_all", "/fix_all"].map((topic, index) => ({ id: index + 1, topic, encoding: "cdr", schemaName: "sensor_msgs/msg/NavSatFix", schemaEncoding: "ros2msg", schema: navSatFixSchema })) });
    await expect.poll(() => server.jsonReceived("subscribe").length).toBeGreaterThanOrEqual(2);
    // Act
    for (const message of server.jsonReceived("subscribe")) {
      const subscriptions = message["subscriptions"] as { id: number }[];
      for (const subscription of subscriptions) {
        const frame = Buffer.alloc(13 + navSatFixBytes.length);
        frame.writeUInt8(1, 0);
        frame.writeUInt32LE(subscription.id, 1);
        Buffer.from(navSatFixBytes).copy(frame, 13);
        server.sendBinary(frame);
      }
    }
    // Assert
    await expect(page.locator(".map-wait")).toBeHidden();
    await expect(page.locator(".map-grid")).toBeVisible();
    await expect(page.locator(".map-attribution")).toHaveText("出典: 地理院タイル");
    for (const control of ["stop", "pause"]) {
      await expect(page.locator(`[data-control="${control}"]`)).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally {
    await server.stop();
  }
});

test("写真の最小ズームは 14、標準地図では 9 に戻る", async ({ page }) => {
  const server = await FakeFoxgloveServer.start();
  try {
    await page.route(/cyberjapandata\.gsi\.go\.jp|tile\.openstreetmap\.org/, (route) => route.fulfill({
      status: 200, contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==", "base64"),
    }));
    await page.goto(`/?ws=${encodeURIComponent(server.url)}`);
    await page.getByRole("tab", { name: "地図" }).click();
    await expect.poll(() => server.sockets.length).toBe(1);
    server.sendJson({ op: "advertise", channels: [{ id: 1, topic: "/fix_all", encoding: "cdr", schemaName: "sensor_msgs/msg/NavSatFix", schemaEncoding: "ros2msg", schema: navSatFixSchema }] });
    await expect.poll(() => server.jsonReceived("subscribe").length).toBeGreaterThan(0);
    const subscriptions = server.jsonReceived("subscribe").flatMap((message) => message["subscriptions"] as { id: number }[]);
    for (const subscription of subscriptions) {
      const frame = Buffer.alloc(13 + navSatFixBytes.length);
      frame.writeUInt8(1, 0);
      frame.writeUInt32LE(subscription.id, 1);
      Buffer.from(navSatFixBytes).copy(frame, 13);
      server.sendBinary(frame);
    }
    await expect(page.locator(".map-wait")).toBeHidden();
    const zoomOut = page.locator(".leaflet-control-zoom-out");
    for (let count = 0; count < 7; count++) {
      await zoomOut.click();
      await page.waitForTimeout(350);
    }
    await expect(zoomOut).toHaveClass(/leaflet-disabled/);
    await page.getByLabel("地図の背景").selectOption("photo");
    await expect(zoomOut).toHaveClass(/leaflet-disabled/);
    await page.getByLabel("地図の背景").selectOption("standard");
    await expect(zoomOut).not.toHaveClass(/leaflet-disabled/);
    for (let count = 0; count < 5; count++) {
      await zoomOut.click();
      await page.waitForTimeout(350);
    }
    await expect(zoomOut).toHaveClass(/leaflet-disabled/);
  } finally {
    await server.stop();
  }
});
