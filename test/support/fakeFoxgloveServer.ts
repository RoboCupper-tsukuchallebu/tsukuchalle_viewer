import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";

/**
 * パラメータの偽のモデル。本物のブリッジとノードに合わせる。
 * - 型の印（type: "float64"）が無い値は受け付けず、前の値を返す（ブリッジは印の無い 1.0 を整数にし、ノードが拒む）。
 * - 書き込める名前は writableLimitNames の対応表にある名前だけ。上限（対応する値）を超える値・0 以下・数でない値は拒む。
 * - 拒むときも、返事は「設定のあとに読み直した今の値」。
 */
export type FakeParameterModel = {
  values: Record<string, number>;
  /** 書ける名前 → 上限を持つ名前。 */
  writableLimitNames: Record<string, string>;
  /** false なら返事を返さない（ノードが応答しないとき）。 */
  isResponding: boolean;
  /** true なら、どんな設定も拒む。 */
  isRejectingEverything: boolean;
};

export type ReceivedFrame = { connectionIndex: number; json?: Record<string, unknown>; binary?: Buffer };

/** foxglove.sdk.v1 だけを受ける偽のサーバー。副プロトコルが違う接続は 400 で拒む。 */
export class FakeFoxgloveServer {
  readonly url: string;
  /** 接続ごとの Sec-WebSocket-Protocol ヘッダー（申し出た値そのまま）。 */
  readonly offeredProtocolHeaders: (string | undefined)[] = [];
  readonly received: ReceivedFrame[] = [];
  readonly sockets: ServerSocket[] = [];

  readonly #server: WebSocketServer;
  /** 設定すると、getParameters・setParameters に返事を返す。 */
  parameterModel: FakeParameterModel | undefined;

  private constructor(server: WebSocketServer) {
    this.#server = server;
    this.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    server.on("connection", (socket, request) => {
      const connectionIndex = this.sockets.length;
      this.sockets.push(socket);
      this.offeredProtocolHeaders.push(request.headers["sec-websocket-protocol"]);
      socket.on("message", (data, isBinary) => {
        const buffer = data as Buffer;
        const frame: ReceivedFrame = isBinary
          ? { connectionIndex, binary: buffer }
          : { connectionIndex, json: JSON.parse(buffer.toString("utf8")) as Record<string, unknown> };
        this.received.push(frame);
        if (frame.json !== undefined) {
          this.#answerParameterRequest(frame.json, socket);
        }
      });
    });
  }

  #answerParameterRequest(message: Record<string, unknown>, socket: ServerSocket): void {
    const model = this.parameterModel;
    if (model === undefined || !model.isResponding) {
      return;
    }
    let requestedNames: string[];
    if (message["op"] === "getParameters") {
      requestedNames = message["parameterNames"] as string[];
    } else if (message["op"] === "setParameters") {
      const parameters = message["parameters"] as { name: string; value?: unknown; type?: string }[];
      requestedNames = parameters.map((parameter) => parameter.name);
      if (!model.isRejectingEverything) {
        for (const parameter of parameters) {
          const limitName = model.writableLimitNames[parameter.name];
          const limit = limitName === undefined ? undefined : model.values[limitName];
          const value = parameter.value;
          if (
            parameter.type === "float64" && typeof value === "number" && Number.isFinite(value) &&
            limit !== undefined && value > 0 && value <= limit
          ) {
            model.values[parameter.name] = value;
          }
        }
      }
    } else {
      return;
    }
    const parameters = requestedNames.flatMap((name) => (name in model.values ? [{ name, value: model.values[name] }] : []));
    socket.send(JSON.stringify({ op: "parameterValues", parameters, id: message["id"] }));
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
