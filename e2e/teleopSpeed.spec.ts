import { expect, test, type Page } from "@playwright/test";
import { WebSocket as NodeWebSocket } from "ws";
import { teleopSpeedParameterNames as names } from "../src/config.ts";
import { FakeFoxgloveServer } from "../test/support/fakeFoxgloveServer.ts";

// スマートフォンの幅（Issue #16 の 5.3 節・V17）。
const phoneViewport = { width: 360, height: 740 };
const minimumTouchTargetHeight = 44;
const connectionTimeoutMs = 10_000;

test.use({ viewport: phoneViewport });

let server: FakeFoxgloveServer;

test.beforeEach(async () => {
  server = await FakeFoxgloveServer.start();
  server.parameterModel = {
    values: { [names.linear]: 0.6, [names.angular]: 1.5, [names.linearLimit]: 1.5, [names.angularLimit]: 4 },
    writableLimitNames: { [names.linear]: names.linearLimit, [names.angular]: names.angularLimit },
    isResponding: true,
    isRejectingEverything: false,
  };
});

test.afterEach(async () => {
  await server.stop();
});

/** ページが開く書き込み用の接続（/ws-control）を、偽のサーバーにつなぎ替える。 */
async function routeWritingConnectionToFakeServer(page: Page): Promise<void> {
  await page.routeWebSocket(/\/ws-control$/, (pageSocket) => {
    const upstream = new NodeWebSocket(server.url, "foxglove.sdk.v1");
    upstream.on("message", (data, isBinary) => {
      if (isBinary) {
        pageSocket.send(data as Buffer);
      } else {
        pageSocket.send((data as Buffer).toString("utf8"));
      }
    });
    pageSocket.onMessage((message) => {
      if (upstream.readyState === NodeWebSocket.OPEN) {
        upstream.send(message);
      }
    });
    pageSocket.onClose(() => {
      upstream.close();
    });
    upstream.on("open", () => {
      server.sendJson({ op: "serverInfo", name: "fake", capabilities: ["parameters"], supportedEncodings: [], sessionId: "e2e" }, server.latestSocket);
    });
  });
}

async function openParametersTab(page: Page): Promise<void> {
  await routeWritingConnectionToFakeServer(page);
  await page.addInitScript(() => {
    localStorage.setItem("tsukuchalle-viewer.selectedTab", "parameters");
  });
  await page.goto("/");
  await expect(page.locator('[data-teleop="linear-current"]')).toContainText("0.60 m/s", { timeout: connectionTimeoutMs });
}

async function expectWithinViewportWidth(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) {
    throw new Error(`要素が見えない: ${selector}`);
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(phoneViewport.width);
}

test("幅 360 px の「パラメータ」のタブで、横にはみ出さず、スライダーと適用が収まり、停止・一時停止が見える", async ({ page }) => {
  // Arrange・Act
  await openParametersTab(page);

  // Assert
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
  for (const selector of ['[data-teleop="linear-slider"]', '[data-teleop="angular-slider"]', ".teleop-speed-button >> nth=0", ".teleop-speed-button >> nth=1"]) {
    await expectWithinViewportWidth(page, selector);
  }
  for (const selector of [".teleop-speed-button >> nth=0", ".teleop-speed-button >> nth=1"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimumTouchTargetHeight);
  }
  for (const control of ["stop", "pause"]) {
    await expect(page.locator(`[data-control="${control}"]`)).toBeInViewport({ ratio: 1 });
  }
});

test("幅 360 px で、確認の画面を経て最大の速さを変えられる", async ({ page }) => {
  // Arrange
  await openParametersTab(page);
  await page.locator('[data-control="write-switch"]').check();
  await page.locator('[data-teleop="linear-slider"]').focus();
  await page.keyboard.press("ArrowLeft");

  // Act
  await page.getByRole("button", { name: "適用", exact: true }).click();

  // Assert
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("直進: 0.60 → 0.55 m/s");
  await page.getByRole("dialog").getByRole("button", { name: "変える" }).click();
  await expect(page.getByRole("status").filter({ hasText: "変えました" })).toBeVisible();
  await expect(page.locator('[data-teleop="linear-current"]')).toContainText("0.55 m/s");
  expect(server.jsonReceived("setParameters")).toHaveLength(1);
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
});
