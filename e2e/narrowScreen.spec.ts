import { readFileSync } from "node:fs";
import { createCdrEncoder } from "../src/decoding/channelDecoder.ts";
import { localizationBytes, localizationMessage } from "../test/fixtures/status/localizationFixture.ts";
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
  const schema = readFileSync("test/fixtures/status/LocalizationStatus.msg", "utf8") + `
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
`;
  server.sendJson({ op: "advertise", channels: [{ id: 201, topic: "/lightnav/localization/status", encoding: "cdr", schemaName: "lightnav_msgs/msg/LocalizationStatus", schema, schemaEncoding: "ros2msg" }] });
  await expect.poll(() => findSubscription(201)).toBeDefined();
  const localizationSubscription = findSubscription(201);
  if (!localizationSubscription) {
    throw new Error("自己位置の購読が見つかりません");
  }
  const localizationHeader = Buffer.alloc(13);
  localizationHeader.writeUInt8(1, 0);
  localizationHeader.writeUInt32LE(localizationSubscription.id, 1);
  server.sendBinary(Buffer.concat([localizationHeader, localizationBytes]));
  await expect(page.locator(".top-bar-localization")).toContainText("TRACKING");
  const longMessage = createCdrEncoder(schema)({ ...localizationMessage, last_error: "long_error_".repeat(40) });
  server.sendBinary(Buffer.concat([localizationHeader, longMessage]));
  await expect(page.locator(".status-panel")).toContainText("long_error_");
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
  await expectStopControlsReachable(page);
});

test("幅 360 px で障害物の表示を切り替えても停止操作が見える", async ({ page }) => {
  await openViewerConnectedToFakeBridge(page, "3d");
  const obstacle = page.getByLabel("障害物を表示");
  await expect(obstacle).toBeVisible();
  await obstacle.check();
  await expect(obstacle).toBeChecked();
  await expectStopControlsReachable(page);
  await obstacle.uncheck();
  await expectStopControlsReachable(page);
});

async function advertiseBattery(topic: string, channelId: number): Promise<void> {
  server.sendJson({ op: "advertise", channels: [{ id: channelId, topic, encoding: "json", schemaName: "test", schema: "" }] });
  await expect.poll(() => findSubscription(channelId)).toBeDefined();
}

function sendBattery(channelId: number, value: unknown): void {
  const subscription = findSubscription(channelId);
  if (!subscription) throw new Error("電池情報の購読が見つかりません");
  const header = Buffer.alloc(13);
  header.writeUInt8(1, 0);
  header.writeUInt32LE(subscription.id, 1);
  server.sendBinary(Buffer.concat([header, Buffer.from(JSON.stringify(value))]));
}

function batteryDiagnostic(level: number): unknown {
  return { status: [{ name: "host: battery", level, message: "4% Discharging", values: [{ key: "capacity_percent", value: "4" }, { key: "status", value: "Discharging" }] }] };
}

test("電池警告は全タブで表示され停止操作を隠さない", async ({ page }) => {
  // Arrange
  await openViewerConnectedToFakeBridge(page, "channels");
  await advertiseBattery("/diagnostics", 300);
  // Act
  sendBattery(300, batteryDiagnostic(2));
  // Assert
  for (const definition of tabDefinitions) {
    await page.getByRole("tab", { name: definition.label }).click();
    await expect(page.locator(".top-bar-battery-warning")).toContainText("4% / 放電中");
    await expect(page.locator(".top-bar-battery-warning")).toBeVisible();
    await expectStopControlsReachable(page);
    for (const control of ["stop", "pause"]) {
      const button = page.locator(`[data-control="${control}"]`);
      if (await button.isEnabled()) await button.click();
    }
  }
});

test("低電池 Bool でも警告する", async ({ page }) => {
  // Arrange
  await openViewerConnectedToFakeBridge(page, "channels");
  await advertiseBattery("/system/low_battery", 301);
  // Act
  sendBattery(301, { data: true });
  // Assert
  await expect(page.locator(".top-bar-battery-warning")).toBeVisible();
});

test("電池診断が OK に戻ると警告が消える", async ({ page }) => {
  // Arrange
  await openViewerConnectedToFakeBridge(page, "channels");
  await advertiseBattery("/diagnostics", 302);
  sendBattery(302, batteryDiagnostic(2));
  await expect(page.locator(".top-bar-battery-warning")).toBeVisible();
  // Act
  sendBattery(302, batteryDiagnostic(0));
  // Assert
  await expect(page.locator(".top-bar-battery-warning")).toBeHidden();
});
