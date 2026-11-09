import { defineConfig, devices } from "@playwright/test";

const previewPort = 4173;

// 画面の試験は Chromium だけ。ビルド済みの dist/ を vite preview で配る（先に vite build が要る）。
export default defineConfig({
  testDir: "e2e",
  forbidOnly: process.env["CI"] !== undefined,
  reporter: process.env["CI"] === undefined ? "list" : "github",
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: process.env["CI"] === undefined,
  },
});
