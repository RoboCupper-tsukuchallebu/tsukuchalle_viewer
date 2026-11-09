import { defineConfig, devices } from "@playwright/test";

const previewPort = 4173;
const sourcePort = 5174;
export default defineConfig({
  testDir: "e2e",
  forbidOnly: process.env["CI"] !== undefined,
  reporter: process.env["CI"] === undefined ? "list" : "github",
  use: { ...devices["Desktop Chrome"] },
  projects: [
    { name: "built", testIgnore: "**/confirmDialog.spec.ts", use: { baseURL: `http://127.0.0.1:${previewPort}` } },
    { name: "source", testMatch: "**/confirmDialog.spec.ts", use: { baseURL: `http://127.0.0.1:${sourcePort}` } },
  ],
  webServer: [
    { command: `npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`, url: `http://127.0.0.1:${previewPort}`, reuseExistingServer: process.env["CI"] === undefined },
    { command: `npx vite --host 127.0.0.1 --port ${sourcePort} --strictPort`, url: `http://127.0.0.1:${sourcePort}`, reuseExistingServer: process.env["CI"] === undefined },
  ],
});
