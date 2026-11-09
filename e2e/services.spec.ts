import { expect, test } from "@playwright/test";

test("幅 360 px でサービスの確認画面を経て起動する", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  let actions = 0;
  await page.route("**/api/services**", async (route) => {
    if (route.request().method() === "POST") { actions += 1; await route.fulfill({ json: { ok: true } }); }
    else await route.fulfill({ json: [{ id: "drive", running: false, started_at: null, image_tag: "example" }] });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "サービス" }).click();
  const start = page.getByRole("button", { name: "起動", exact: true });
  await expect(start).toBeDisabled();
  await page.locator('[data-control="write-switch"]').check();
  await start.click();
  await expect(page.getByRole("dialog")).toContainText("モーターはゲームパッドの Start まで動かない");
  expect(actions).toBe(0);
  await page.getByRole("dialog").getByRole("button", { name: "起動" }).click();
  await expect.poll(() => actions).toBe(1);
  await expect(page.locator('[data-control="stop"]')).toBeInViewport();
  await expect(page.locator('[data-control="pause"]')).toBeInViewport();
});
