import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 360, height: 740 } });
async function openDialog(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    const modulePath: string = "/src/control/confirmDialog.ts";
    void (import(/* @vite-ignore */ modulePath) as Promise<typeof import("../src/control/confirmDialog.ts")>).then(({ requestConfirmation }) => {
      void requestConfirmation({ title: "確認", lines: [], confirmLabel: "送る" }).then((result: boolean) => { document.body.dataset["result"] = String(result); });
    });
  });
  await expect(page.locator(".confirm-overlay")).toBeVisible();
}
test("Enter は送信せず、クリックで確認する", async ({ page }) => {
  await openDialog(page);
  await expect(page.locator('[data-role="cancel"]')).toBeFocused();
  await page.locator('[data-role="confirm"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".confirm-overlay")).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-result");
  await page.locator('[data-role="confirm"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-result", "true");
  await expect(page.locator(".confirm-overlay")).toHaveCount(0);
});
test("Escape で取り消す", async ({ page }) => {
  await openDialog(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).toHaveAttribute("data-result", "false");
  await expect(page.locator(".confirm-overlay")).toHaveCount(0);
});
