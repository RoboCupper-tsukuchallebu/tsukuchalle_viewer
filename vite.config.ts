import { defineConfig, loadEnv } from "vite";

export function createDevProxy(devBridgeUrl?: string, controlBridgeUrl?: string) {
  return {
    ...(controlBridgeUrl ? { "^/ws-control$": { target: controlBridgeUrl, ws: true, rewrite: () => "/" } } : {}),
    ...(devBridgeUrl ? { "^/ws$": { target: devBridgeUrl, ws: true, rewrite: () => "/" } } : {}),
  };
}

// 3D のチャンクは Three.js 本体で約 500 kB を超える。3D のタブを開いたときだけ読み込まれ、初回の JavaScript には含まれない。
const threeDimensionalChunkLimitKilobytes = 700;

// 開発中だけ使う。中継先は commit しない .env.local の VIEWER_DEV_BRIDGE_URL で決める（例: ws://localhost:8765）。
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VIEWER_");
  const devBridgeUrl = environment["VIEWER_DEV_BRIDGE_URL"];
  const controlBridgeUrl = environment["VIEWER_DEV_CONTROL_BRIDGE_URL"];
  return {
    build: { chunkSizeWarningLimit: threeDimensionalChunkLimitKilobytes },
    server: {
      proxy: createDevProxy(devBridgeUrl, controlBridgeUrl),
    },
    test: {
      include: ["test/**/*.test.ts"],
      environment: "node",
    },
  };
});
