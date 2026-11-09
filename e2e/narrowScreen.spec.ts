import { expect, test, type Page } from "@playwright/test";
import { tabDefinitions } from "../src/layout/tabs.ts";
import { FakeFoxgloveServer, sampleChannel } from "../test/support/fakeFoxgloveServer.ts";

// スマートフォンの幅（仕様 4.2 節・9 章）。
const phoneViewport = { width: 360, height: 740 };
const manyChannelCount = 80;

test.use({ viewport: phoneViewport });

let server: FakeFoxgloveServer;

test.beforeEach(async () => {
  server = await FakeFoxgloveServer.start();
});

test.afterEach(async () => {
  await server.stop();
});

/** 偽の bridge につなぎ、長い capabilities とたくさんのチャネルを出させて、ページを縦にも横にも長くしようとする。 */
async function openViewerConnectedToFakeBridge(page: Page, tabId: string): Promise<void> {
  await page.addInitScript((selectedTab) => {
    localStorage.setItem("tsukuchalle-viewer.selectedTab", selectedTab);
  }, tabId);
  await page.goto(`/?ws=${encodeURIComponent(server.url)}`);
  await expect.poll(() => server.sockets.length).toBe(1);
  server.sendJson({
    op: "serverInfo",
    name: "fake",
    capabilities: ["clientPublish", "parameters", "parametersSubscribe", "services", "connectionGraph", "assets"],
    supportedEncodings: ["cdr"],
    sessionId: "e2e",
  });
  const channels = Array.from({ length: manyChannelCount }, (_, index) => ({
    ...sampleChannel,
    id: index + 1,
    topic: `/example/a_very_long_topic_name_for_a_narrow_screen/${index}`,
  }));
  server.sendJson({ op: "advertise", channels });
  await expect(page.locator('[data-connection="閲覧用"]')).toContainText("capabilities: clientPublish");
}

async function expectStopControlsReachable(page: Page): Promise<void> {
  for (const control of ["stop", "pause"]) {
    const button = page.locator(`[data-control="${control}"]`);
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport({ ratio: 1 });
  }
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
}

for (const definition of tabDefinitions) {
  test(`幅 360 px で、${definition.label}のタブでも停止・一時停止が画面の中に見える`, async ({ page }) => {
    // Arrange
    await openViewerConnectedToFakeBridge(page, definition.id);

    // Act・Assert
    await expectStopControlsReachable(page);
  });
}

test("幅 360 px で、ページを下まで送っても停止・一時停止は画面の中にある", async ({ page }) => {
  // Arrange
  await openViewerConnectedToFakeBridge(page, "channels");
  await expect(page.locator(".channel-table tr[data-topic]")).toHaveCount(manyChannelCount);

  // Act
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });

  // Assert
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expectStopControlsReachable(page);
});

function findSubscription(channelId: number): { id: number; channelId: number } | undefined {
  return server.jsonReceived("subscribe")
    .flatMap((message) => message["subscriptions"] as { id: number; channelId: number }[])
    .find((subscription) => subscription.channelId === channelId);
}

test("幅 360 px の状態パネルで長い診断値を表示しても操作が収まる", async ({ page }) => {
  // Arrange
  await openViewerConnectedToFakeBridge(page, "status");
  await expect(page.locator(".status-panel")).toBeVisible();
  server.sendJson({ op: "advertise", channels: [{ id: 200, topic: "/diagnostics", encoding: "json", schemaName: "diagnostics", schema: "" }] });
  await expect.poll(() => findSubscription(200)).toBeDefined();
  const subscription = findSubscription(200);
  if (!subscription) {
    throw new Error("購読が見つかりません");
  }
  const payload = Buffer.from(JSON.stringify({ status: [{ name: "long_diagnostic_name_".repeat(8), level: 1, message: "", values: [{ key: "long_key_".repeat(10), value: "long_value_".repeat(20) }] }] }));
  const header = Buffer.alloc(13);
  header.writeUInt8(1, 0);
  header.writeUInt32LE(subscription.id, 1);
  // Act
  server.sendBinary(Buffer.concat([header, payload]));
  // Assert
  await expect(page.locator(".status-panel")).toContainText("long_value_");
  await page.locator(".status-fields dd").first().hover();
  await page.locator(".top-bar-localization").evaluate((element) => { element.textContent = "長い自己位置情報".repeat(50); });
  await expectStopControlsReachable(page);
  for (const control of ["stop", "pause"]) {
    const button = page.locator(`[data-control="${control}"]`);
    if (await button.isEnabled()) await button.click();
  }
});
