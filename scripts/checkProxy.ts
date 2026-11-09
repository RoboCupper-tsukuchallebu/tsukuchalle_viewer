// イメージを起動したあとで、nginx が /ws を bridge に中継することを確かめる。
// 偽の bridge（foxglove.sdk.v1 だけを選ぶ）を立て、ページと同じ origin の /ws からつなぐ。
// 使い方: VIEWER_PORT=18080 VIEWER_BRIDGE_PORT=18765 node scripts/checkProxy.ts
import { WebSocketServer } from "ws";

const viewerPort = Number(process.env["VIEWER_PORT"] ?? "8080");
const bridgePort = Number(process.env["VIEWER_BRIDGE_PORT"] ?? "8765");
const subprotocol = "foxglove.sdk.v1";

const seenByBridge: { upgrade: string | undefined; offeredProtocol: string | undefined }[] = [];
const bridge = new WebSocketServer({
  host: "127.0.0.1",
  port: bridgePort,
  handleProtocols: (protocols) => (protocols.has(subprotocol) ? subprotocol : false),
});
bridge.on("connection", (socket, request) => {
  seenByBridge.push({
    upgrade: request.headers.upgrade,
    offeredProtocol: request.headers["sec-websocket-protocol"],
  });
  socket.send("hello from bridge");
});
await new Promise<void>((resolve) => bridge.once("listening", resolve));

function fail(message: string): never {
  console.error(`NG: ${message}`);
  process.exit(1);
}

const client = new WebSocket(`ws://127.0.0.1:${viewerPort}/ws`, [subprotocol]);
const firstMessage = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => {
    reject(new Error("5 秒以内に届かなかった"));
  }, 5000);
  client.addEventListener("message", (event: MessageEvent<unknown>) => {
    clearTimeout(timer);
    resolve(String(event.data));
  });
  client.addEventListener("error", () => {
    clearTimeout(timer);
    reject(new Error("WebSocket の接続に失敗した"));
  });
}).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));

if (client.protocol !== subprotocol) {
  fail(`ブラウザ側で選ばれた副プロトコルが ${client.protocol}`);
}
if (firstMessage !== "hello from bridge") {
  fail(`中継された本文が違う: ${firstMessage}`);
}
const [seen] = seenByBridge;
if (seen?.upgrade?.toLowerCase() !== "websocket" || seen.offeredProtocol !== subprotocol) {
  fail(`bridge に届いたヘッダーが違う: ${JSON.stringify(seen)}`);
}
console.log("OK: /ws は Upgrade と Sec-WebSocket-Protocol を通して中継される");
client.close();
bridge.close();
process.exit(0);
