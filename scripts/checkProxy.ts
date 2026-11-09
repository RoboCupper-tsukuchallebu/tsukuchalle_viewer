// nginx の閲覧用・書き込み用の中継と許可リストを確かめる。
import { createServer, request } from "node:http";
import WebSocket, { WebSocketServer } from "ws";

const viewerPort = Number(process.env["VIEWER_PORT"] ?? "8080");
const bridgePort = Number(process.env["VIEWER_BRIDGE_PORT"] ?? "8765");
const controlPort = Number(process.env["VIEWER_CONTROL_BRIDGE_PORT"] ?? "8766");
const origin = process.env["VIEWER_ALLOWED_ORIGINS"]?.trim().split(/\s+/)[0];
const host = process.env["VIEWER_ALLOWED_HOSTS"]?.trim().split(/\s+/)[0];
const managerPort = Number(process.env["SERVICE_MANAGER_PORT"] ?? "8790");
const subprotocol = "foxglove.sdk.v1";
if (!origin || !host) throw new Error("許可リストの設定が必要です");

let controlConnections = 0;
const countControlConnections = () => controlConnections;
function startBridge(port: number, control: boolean): Promise<WebSocketServer> {
  const server = new WebSocketServer({ host: "127.0.0.1", port, handleProtocols: (protocols) => protocols.has(subprotocol) ? subprotocol : false });
  server.on("connection", (socket, request) => {
    if (request.headers.upgrade?.toLowerCase() !== "websocket" || request.headers["sec-websocket-protocol"] !== subprotocol) throw new Error("ヘッダーが違います");
    if (control) controlConnections += 1;
    socket.send("hello from bridge");
  });
  return new Promise((resolve) => server.once("listening", () => { resolve(server); }));
}
const viewing = await startBridge(bridgePort, false);
const writing = await startBridge(controlPort, true);
async function connect(path: string, requestOrigin?: string, requestHost?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${viewerPort}${path}`, subprotocol, {
      ...(requestOrigin ? { origin: requestOrigin } : {}),
      ...(requestHost ? { headers: { Host: requestHost } } : {}),
    });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("接続がタイムアウトしました")); }, 5000);
    socket.on("message", (message) => {
      clearTimeout(timer);
      if (Buffer.from(message as Buffer).toString() !== "hello from bridge" || socket.protocol !== subprotocol) reject(new Error("中継内容が違います"));
      else resolve(101);
      socket.close();
    });
    socket.on("unexpected-response", (_request, response) => { clearTimeout(timer); resolve(response.statusCode ?? 0); response.destroy(); socket.terminate(); });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}
const manager = createServer((_req, res) => { res.writeHead(200); res.end("ok"); });
await new Promise<void>((resolve) => manager.listen(managerPort, "127.0.0.1", resolve));
function checkHttp(method: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: viewerPort, path: "/api/services", method, headers }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on("error", reject); req.end();
  });
}
try {
  for (const [method, headers, expected] of [
    ["GET", { Host: host, Origin: origin }, 200],
    ["GET", { Host: host, Referer: `${origin}/page` }, 200],
    ["GET", { Host: host }, 403],
    ["GET", { Host: "invalid.example", Origin: origin }, 403],
    ["GET", { Host: host, Origin: "http://invalid.example" }, 403],
    ["GET", { Host: host, Referer: "http://invalid.example/page" }, 403],
    ["GET", { Host: host, Origin: origin, "Sec-Fetch-Site": "cross-site" }, 403],
    ["POST", { Host: host, Referer: `${origin}/page` }, 403],
    ["POST", { Host: host, Origin: origin }, 200],
  ] as [string, Record<string, string>, number][]) {
    if (await checkHttp(method, headers) !== expected) throw new Error(`サービス API の許可リストが不正: ${method} ${JSON.stringify(headers)}`);
  }
  if (await connect("/ws") !== 101) throw new Error("閲覧用の接続に失敗しました");
  if (await connect("/ws-control", origin, host) !== 101 || countControlConnections() !== 1) throw new Error("書き込み用の接続に失敗しました");
  for (const [testOrigin, testHost] of [["http://invalid.example", host], [origin, "invalid.example"], [undefined, host]] as const) {
    if (await connect("/ws-control", testOrigin, testHost) !== 403 || countControlConnections() !== 1) throw new Error("許可リストによる拒否に失敗しました");
  }
  console.log("OK: /ws と /ws-control の中継および Host・Origin の拒否");
} finally {
  manager.close();
  viewing.close();
  writing.close();
}
