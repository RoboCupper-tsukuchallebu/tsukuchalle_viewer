import { expect, test } from "@playwright/test";
import { FakeFoxgloveServer, sampleChannel } from "../test/support/fakeFoxgloveServer.ts";

test.use({ viewport: { width: 360, height: 740 } });
test("幅 360 px で MarkerArray のトグルを操作できる", async ({ page }) => {
  const server = await FakeFoxgloveServer.start();
  try {
    await page.addInitScript(() => { localStorage.setItem("tsukuchalle-viewer.selectedTab", "3d"); });
    await page.goto(`/?ws=${encodeURIComponent(server.url)}`);
    await expect.poll(() => server.sockets.length).toBe(1);
    server.sendJson({ op: "advertise", channels: [{ ...sampleChannel, id: 42, topic: "/lightnav/controller/arc_candidates", schemaName: "visualization_msgs/msg/MarkerArray" }, { ...sampleChannel, id: 43, topic: "/example/markers", schemaName: "visualization_msgs/msg/MarkerArray" }] });
    const arc = page.getByLabel("/lightnav/controller/arc_candidates");
    const other = page.getByLabel("/example/markers");
    await expect(arc).toBeChecked(); await expect(other).not.toBeChecked();
    await other.check(); await arc.uncheck(); await expect(other).toBeChecked(); await expect(arc).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally { await server.stop(); }
});
