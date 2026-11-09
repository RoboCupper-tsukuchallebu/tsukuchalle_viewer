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

test("360px で waypoint の確認と全タブの停止操作", async ({ page }) => {
  let calls = 0;
  await page.routeWebSocket("**/ws-control", (socket) => {
    socket.onMessage((message) => { if (typeof message !== "string") calls++; });
    socket.send(JSON.stringify({ op: "advertiseServices", services: [{ id: 1, name: "/lightnav/mission/follow_waypoints/_action/cancel_goal", type: "action_msgs/srv/CancelGoal", request: { encoding: "cdr", schemaName: "request", schema: `action_msgs/GoalInfo goal_info\n================================================================================\nMSG: action_msgs/GoalInfo\nunique_identifier_msgs/UUID goal_id\nbuiltin_interfaces/Time stamp\n================================================================================\nMSG: unique_identifier_msgs/UUID\nuint8[16] uuid\n================================================================================\nMSG: builtin_interfaces/Time\nint32 sec\nuint32 nanosec` }, response: { encoding: "cdr", schemaName: "response", schema: "int8 return_code\naction_msgs/GoalInfo[] goals_canceling\n================================================================================\nMSG: action_msgs/GoalInfo\nunique_identifier_msgs/UUID goal_id\nbuiltin_interfaces/Time stamp\n================================================================================\nMSG: unique_identifier_msgs/UUID\nuint8[16] uuid\n================================================================================\nMSG: builtin_interfaces/Time\nint32 sec\nuint32 nanosec" } }] }));
  });
  await page.goto("/");
  await expect(page.locator('[data-control="stop"]')).toBeEnabled();
  await page.evaluate(async () => {
    const modulePath: string = "/src/store/waypointStore.ts";
    const { waypointStore } = await import(/* @vite-ignore */ modulePath) as typeof import("../src/store/waypointStore.ts");
    waypointStore.add(1, 2);
  });
  await page.locator('[data-control="write-switch"]').check();
  await page.getByRole("button", { name: "mission に送信" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 件");
  await expect(page.getByRole("dialog")).toContainText("preempt");
  await expect(page.getByRole("dialog")).toBeInViewport();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "取り消し" }).click();
  for (const tab of ["3d", "map", "satellites", "status", "parameters", "channels"]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    const stop = page.locator('[data-control="stop"]');
    await expect(stop).toBeInViewport();
    await stop.click();
  }
  await expect.poll(() => calls).toBe(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
