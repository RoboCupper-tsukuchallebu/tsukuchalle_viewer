import { defineConfig, loadEnv } from "vite";

// 開発中だけ使う。中継先は commit しない .env.local の VIEWER_DEV_BRIDGE_URL で決める（例: ws://localhost:8765）。
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VIEWER_");
  const devBridgeUrl = environment["VIEWER_DEV_BRIDGE_URL"];
  const controlBridgeUrl = environment["VIEWER_DEV_CONTROL_BRIDGE_URL"];
  return {
    server: {
      proxy: {
        ...(controlBridgeUrl ? { "/ws-control": { target: controlBridgeUrl, ws: true, rewrite: () => "/" } } : {}),
        ...(devBridgeUrl ? { "/ws": { target: devBridgeUrl, ws: true, rewrite: () => "/" } } : {}),
      },
    },
    test: {
      include: ["test/**/*.test.ts"],
      environment: "node",
    },
  };
});
