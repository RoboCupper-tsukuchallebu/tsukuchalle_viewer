import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";

export type ReceivedFrame = { connectionIndex: number; json?: Record<string, unknown>; binary?: Buffer };

/** foxglove.sdk.v1 だけを受ける偽のサーバー。副プロトコルが違う接続は 400 で拒む。 */
export class FakeFoxgloveServer {
  readonly url: string;
  /** 接続ごとの Sec-WebSocket-Protocol ヘッダー（申し出た値そのまま）。 */
  readonly offeredProtocolHeaders: (string | undefined)[] = [];
  readonly received: ReceivedFrame[] = [];
  readonly sockets: ServerSocket[] = [];

  readonly #server: WebSocketServer;

  private constructor(server: WebSocketServer) {
    this.#server = server;
    this.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    server.on("connection", (socket, request) => {
      const connectionIndex = this.sockets.length;
      this.sockets.push(socket);
      this.offeredProtocolHeaders.push(request.headers["sec-websocket-protocol"]);
      socket.on("message", (data, isBinary) => {
        const buffer = data as Buffer;
        this.received.push(
          isBinary
            ? { connectionIndex, binary: buffer }
            : { connectionIndex, json: JSON.parse(buffer.toString("utf8")) as Record<string, unknown> },
        );
      });
    });
  }

  static async start(acceptedProtocol = "foxglove.sdk.v1"): Promise<FakeFoxgloveServer> {
    const server = new WebSocketServer({
      port: 0,
      host: "127.0.0.1",
      // 本物のサーバーと同じく、申し出に無い副プロトコルのときは握手そのものを拒む。
      verifyClient: ({ req }: { req: IncomingMessage }) => (req.headers["sec-websocket-protocol"] ?? "").split(",").map((item) => item.trim()).includes(acceptedProtocol),
      handleProtocols: (protocols) => (protocols.has(acceptedProtocol) ? acceptedProtocol : false),
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    return new FakeFoxgloveServer(server);
  }

  get latestSocket(): ServerSocket {
    const socket = this.sockets.at(-1);
    if (!socket) {
      throw new Error("まだ接続が無い");
    }
    return socket;
  }

  sendJson(message: object, socket: ServerSocket = this.latestSocket): void {
    socket.send(JSON.stringify(message));
  }

  sendBinary(frame: Buffer, socket: ServerSocket = this.latestSocket): void {
    socket.send(frame, { binary: true });
  }

  jsonReceived(op: string, connectionIndex?: number): Record<string, unknown>[] {
    return this.received
      .filter((frame) => frame.json?.["op"] === op && (connectionIndex === undefined || frame.connectionIndex === connectionIndex))
      .map((frame) => frame.json as Record<string, unknown>);
  }

  binaryReceived(connectionIndex?: number): Buffer[] {
    return this.received
      .filter((frame) => frame.binary !== undefined && (connectionIndex === undefined || frame.connectionIndex === connectionIndex))
      .map((frame) => frame.binary as Buffer);
  }

  dropAllConnections(): void {
    this.sockets.forEach((socket) => {
      socket.terminate();
    });
  }

  async stop(): Promise<void> {
    this.dropAllConnections();
    await new Promise<void>((resolve) => {
      this.#server.close(() => {
        resolve();
      });
    });
  }
}

export const sampleChannel = {
  id: 7,
  topic: "/example",
  encoding: "json",
  schemaName: "example",
  schema: "",
};
