import { encodeServiceCallRequest, parseServerBinaryFrame } from "./binaryFrames.ts";
import {
  BinaryOpcode,
  SUBPROTOCOL,
  type Channel,
  type ClientJsonMessage,
  type ConnectionGraphUpdate,
  type Parameter,
  type ServerJsonMessage,
  type ServiceDescription,
  type StatusLevel,
} from "./protocol.ts";
import { initialReconnectDelayMs, maximumReconnectDelayMs, reconnectDelayMs } from "./reconnectDelay.ts";
import { parseServerJson } from "./serverJson.ts";
import { TypedEmitter } from "./typedEmitter.ts";

/** idle: まだ connect していない / closed: close() で止めた（つなぎ直さない） */
export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

export type ServerInfo = { name: string; capabilities: string[]; supportedEncodings: string[]; sessionId?: string };

export type TopicMessage = {
  topic: string;
  channelId: number;
  logTimeNanoseconds: bigint;
  payload: Uint8Array;
};

export type ServiceCallResponse = { encoding: string; payload: Uint8Array };

export type FoxgloveClientEvents = {
  stateChanged: ConnectionState;
  serverInfo: ServerInfo;
  status: { level: StatusLevel; message: string; id?: string };
  removeStatus: string[];
  channelsChanged: ReadonlyMap<number, Channel>;
  servicesChanged: ReadonlyMap<number, ServiceDescription>;
  message: TopicMessage;
  parameterValues: Parameter[];
  connectionGraphUpdate: ConnectionGraphUpdate;
  connectionError: string;
};

export type FoxgloveClientOptions = {
  url: string;
  /** 試験用。既定は副プロトコル foxglove.sdk.v1 だけを申し出る WebSocket。 */
  createWebSocket?: (url: string, protocols: string[]) => WebSocket;
  initialReconnectDelayMs?: number;
  maximumReconnectDelayMs?: number;
};

type PendingRequest<Result> = { resolve: (result: Result) => void; reject: (error: Error) => void };

/**
 * foxglove.sdk.v1 の薄いクライアント。ROS は知らない。
 * トピックは名前で購読する。チャネル ID は接続ごとに変わるので、advertise が来るたびに名前から購読し直す。
 */
export class FoxgloveClient extends TypedEmitter<FoxgloveClientEvents> {
  readonly url: string;

  #socket: WebSocket | undefined;
  #state: ConnectionState = "idle";
  #serverInfo: ServerInfo | undefined;
  #channels = new Map<number, Channel>();
  #services = new Map<number, ServiceDescription>();

  #wantedTopics = new Set<string>();
  #subscriptionIdByChannelId = new Map<number, number>();
  #channelIdBySubscriptionId = new Map<number, number>();
  #nextSubscriptionId = 1;

  #wantedParameterUpdateNames = new Set<string>();
  #isConnectionGraphWanted = false;

  #nextCallId = 1;
  #pendingServiceCalls = new Map<string, PendingRequest<ServiceCallResponse>>();
  #nextParameterRequestId = 1;
  #pendingParameterRequests = new Map<string, PendingRequest<Parameter[]>>();

  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  readonly #createWebSocket: (url: string, protocols: string[]) => WebSocket;
  readonly #initialDelayMs: number;
  readonly #maximumDelayMs: number;

  constructor(options: FoxgloveClientOptions) {
    super();
    this.url = options.url;
    this.#createWebSocket = options.createWebSocket ?? ((url, protocols) => new WebSocket(url, protocols));
    this.#initialDelayMs = options.initialReconnectDelayMs ?? initialReconnectDelayMs;
    this.#maximumDelayMs = options.maximumReconnectDelayMs ?? maximumReconnectDelayMs;
  }

  get state(): ConnectionState {
    return this.#state;
  }
  get serverInfo(): ServerInfo | undefined {
    return this.#serverInfo;
  }
  get channels(): ReadonlyMap<number, Channel> {
    return this.#channels;
  }
  get services(): ReadonlyMap<number, ServiceDescription> {
    return this.#services;
  }
  hasCapability(capability: string): boolean {
    return this.#serverInfo?.capabilities.includes(capability) ?? false;
  }
  isSubscribedToTopic(topic: string): boolean {
    return this.#wantedTopics.has(topic);
  }

  connect(): void {
    if (this.#state !== "idle" && this.#state !== "closed") {
      return;
    }
    this.#reconnectAttempt = 0;
    this.#openSocket("connecting");
  }

  close(): void {
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#setState("closed");
    this.#socket?.close();
  }

  // ---- トピック（名前で購読する） ----

  subscribeToTopic(topic: string): void {
    this.#wantedTopics.add(topic);
    for (const channel of this.#channels.values()) {
      if (channel.topic === topic) {
        this.#subscribeToChannel(channel);
      }
    }
  }

  unsubscribeFromTopic(topic: string): void {
    this.#wantedTopics.delete(topic);
    const subscriptionIds: number[] = [];
    for (const channel of this.#channels.values()) {
      const subscriptionId = this.#subscriptionIdByChannelId.get(channel.id);
      if (channel.topic === topic && subscriptionId !== undefined) {
        this.#forgetSubscription(channel.id);
        subscriptionIds.push(subscriptionId);
      }
    }
    if (subscriptionIds.length > 0) {
      this.#sendJson({ op: "unsubscribe", subscriptionIds });
    }
  }

  // ---- サービス ----

  /** 切断・serviceCallFailure では reject する。待ち時間の上限（タイムアウト）は呼び出し側が決める。 */
  callService(serviceId: number, payload: Uint8Array, encoding = "cdr"): Promise<ServiceCallResponse> {
    const callId = this.#nextCallId++;
    return new Promise((resolve, reject) => {
      if (!this.#isOpen()) {
        reject(new Error("disconnected"));
        return;
      }
      this.#pendingServiceCalls.set(serviceCallKey(serviceId, callId), { resolve, reject });
      this.#socket?.send(encodeServiceCallRequest({ serviceId, callId, encoding, payload }));
    });
  }

  // ---- パラメータ ----

  getParameters(parameterNames: string[]): Promise<Parameter[]> {
    return this.#requestParameters((id) => ({ op: "getParameters", parameterNames, id }));
  }

  setParameters(parameters: Parameter[]): Promise<Parameter[]> {
    return this.#requestParameters((id) => ({ op: "setParameters", parameters, id }));
  }

  subscribeParameterUpdates(parameterNames: string[]): void {
    parameterNames.forEach((name) => this.#wantedParameterUpdateNames.add(name));
    this.#sendJson({ op: "subscribeParameterUpdates", parameterNames });
  }

  unsubscribeParameterUpdates(parameterNames: string[]): void {
    parameterNames.forEach((name) => this.#wantedParameterUpdateNames.delete(name));
    this.#sendJson({ op: "unsubscribeParameterUpdates", parameterNames });
  }

  // ---- 接続グラフ ----

  subscribeConnectionGraph(): void {
    this.#isConnectionGraphWanted = true;
    this.#sendJson({ op: "subscribeConnectionGraph" });
  }

  unsubscribeConnectionGraph(): void {
    this.#isConnectionGraphWanted = false;
    this.#sendJson({ op: "unsubscribeConnectionGraph" });
  }

  // ---- 内部: 接続 ----

  #openSocket(nextState: ConnectionState): void {
    this.#setState(nextState);
    const socket = this.#createWebSocket(this.url, [SUBPROTOCOL]);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.addEventListener("open", () => {
      if (this.#socket !== socket) {
        socket.close(); // close() が先に呼ばれた
        return;
      }
      if (socket.protocol !== SUBPROTOCOL) {
        this.emit("connectionError", `サーバーが副プロトコル ${SUBPROTOCOL} を選びませんでした`);
        socket.close();
        return;
      }
      this.#reconnectAttempt = 0;
      this.#setState("connected");
      this.#resendWantedSubscriptions();
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (this.#socket === socket) {
        this.#handleFrame(event.data);
      }
    });
    socket.addEventListener("close", () => {
      this.#handleClose(socket);
    });
  }

  #handleClose(closedSocket: WebSocket): void {
    if (this.#socket !== closedSocket) {
      return;
    }
    this.#socket = undefined;
    this.#resetServerState();
    if (this.#state === "closed") {
      return;
    }
    this.#setState("reconnecting");
    const delay = reconnectDelayMs(this.#reconnectAttempt, this.#initialDelayMs, this.#maximumDelayMs);
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#openSocket("reconnecting");
    }, delay);
  }

  /** チャネル ID・サービス ID・購読 ID はすべて接続ごとなので捨て、待っている要求を失敗にする。「送信中」のまま残さない。 */
  #resetServerState(): void {
    this.#serverInfo = undefined;
    this.#channels = new Map();
    this.#services = new Map();
    this.#subscriptionIdByChannelId.clear();
    this.#channelIdBySubscriptionId.clear();
    const disconnected = new Error("disconnected");
    for (const pending of this.#pendingServiceCalls.values()) pending.reject(disconnected);
    for (const pending of this.#pendingParameterRequests.values()) pending.reject(disconnected);
    this.#pendingServiceCalls.clear();
    this.#pendingParameterRequests.clear();
    this.emit("channelsChanged", this.#channels);
    this.emit("servicesChanged", this.#services);
  }

  #resendWantedSubscriptions(): void {
    if (this.#wantedParameterUpdateNames.size > 0) {
      this.#sendJson({ op: "subscribeParameterUpdates", parameterNames: [...this.#wantedParameterUpdateNames] });
    }
    if (this.#isConnectionGraphWanted) {
      this.#sendJson({ op: "subscribeConnectionGraph" });
    }
  }

  #setState(state: ConnectionState): void {
    if (this.#state !== state) {
      this.#state = state;
      this.emit("stateChanged", state);
    }
  }

  #isOpen(): boolean {
    return this.#state === "connected" && this.#socket?.readyState === WebSocket.OPEN;
  }

  #sendJson(message: ClientJsonMessage): void {
    if (this.#isOpen()) {
      this.#socket?.send(JSON.stringify(message));
    }
  }

  // ---- 内部: 受信 ----

  #handleFrame(data: unknown): void {
    if (typeof data === "string") {
      const message = parseServerJson(data);
      if (message) {
        this.#handleJson(message);
      }
    } else if (data instanceof ArrayBuffer) {
      this.#handleBinary(data);
    }
  }

  #handleJson(message: ServerJsonMessage): void {
    switch (message.op) {
      case "serverInfo": {
        const { op: _op, ...serverInfo } = message;
        this.#serverInfo = serverInfo;
        this.emit("serverInfo", serverInfo);
        break;
      }
      case "status": {
        const { op: _op, ...status } = message;
        this.emit("status", status);
        break;
      }
      case "removeStatus":
        this.emit("removeStatus", message.statusIds);
        break;
      case "advertise":
        for (const channel of message.channels) {
          this.#channels.set(channel.id, channel);
          if (this.#wantedTopics.has(channel.topic)) {
            this.#subscribeToChannel(channel);
          }
        }
        this.emit("channelsChanged", this.#channels);
        break;
      case "unadvertise":
        for (const channelId of message.channelIds) {
          this.#channels.delete(channelId);
          this.#forgetSubscription(channelId);
        }
        this.emit("channelsChanged", this.#channels);
        break;
      case "advertiseServices":
        message.services.forEach((service) => this.#services.set(service.id, service));
        this.emit("servicesChanged", this.#services);
        break;
      case "unadvertiseServices":
        message.serviceIds.forEach((serviceId) => this.#services.delete(serviceId));
        this.emit("servicesChanged", this.#services);
        break;
      case "parameterValues":
        this.#handleParameterValues(message.parameters, message.id);
        break;
      case "connectionGraphUpdate": {
        const { op: _op, ...update } = message;
        this.emit("connectionGraphUpdate", update);
        break;
      }
      case "serviceCallFailure":
        this.#settleServiceCall(message.serviceId, message.callId, (pending) => {
          pending.reject(new Error(message.message));
        });
        break;
    }
  }

  #handleBinary(frame: ArrayBuffer): void {
    const message = parseServerBinaryFrame(frame);
    if (message?.opcode === BinaryOpcode.messageData) {
      const channelId = this.#channelIdBySubscriptionId.get(message.subscriptionId);
      const channel = channelId === undefined ? undefined : this.#channels.get(channelId);
      if (channel) {
        this.emit("message", {
          topic: channel.topic,
          channelId: channel.id,
          logTimeNanoseconds: message.logTimeNanoseconds,
          payload: message.payload,
        });
      }
    } else if (message?.opcode === BinaryOpcode.serviceCallResponse) {
      this.#settleServiceCall(message.serviceId, message.callId, (pending) => {
        pending.resolve({ encoding: message.encoding, payload: message.payload });
      });
    }
  }

  #handleParameterValues(parameters: Parameter[], requestId: string | undefined): void {
    const pending = requestId === undefined ? undefined : this.#pendingParameterRequests.get(requestId);
    if (requestId !== undefined && pending) {
      this.#pendingParameterRequests.delete(requestId);
      pending.resolve(parameters);
    }
    // 購読している更新（id が無い）も、要求への返事も、画面には同じように届ける。
    this.emit("parameterValues", parameters);
  }

  #settleServiceCall(serviceId: number, callId: number, settle: (pending: PendingRequest<ServiceCallResponse>) => void): void {
    const key = serviceCallKey(serviceId, callId);
    const pending = this.#pendingServiceCalls.get(key);
    if (pending) {
      this.#pendingServiceCalls.delete(key);
      settle(pending);
    }
  }

  #requestParameters(buildMessage: (id: string) => ClientJsonMessage): Promise<Parameter[]> {
    const id = `parameter-request-${this.#nextParameterRequestId++}`;
    return new Promise((resolve, reject) => {
      if (!this.#isOpen()) {
        reject(new Error("disconnected"));
        return;
      }
      this.#pendingParameterRequests.set(id, { resolve, reject });
      this.#sendJson(buildMessage(id));
    });
  }

  #subscribeToChannel(channel: Channel): void {
    if (this.#subscriptionIdByChannelId.has(channel.id) || !this.#isOpen()) {
      return;
    }
    const subscriptionId = this.#nextSubscriptionId++;
    this.#subscriptionIdByChannelId.set(channel.id, subscriptionId);
    this.#channelIdBySubscriptionId.set(subscriptionId, channel.id);
    this.#sendJson({ op: "subscribe", subscriptions: [{ id: subscriptionId, channelId: channel.id }] });
  }

  #forgetSubscription(channelId: number): void {
    const subscriptionId = this.#subscriptionIdByChannelId.get(channelId);
    if (subscriptionId !== undefined) {
      this.#channelIdBySubscriptionId.delete(subscriptionId);
    }
    this.#subscriptionIdByChannelId.delete(channelId);
  }
}

function serviceCallKey(serviceId: number, callId: number): string {
  return `${serviceId}:${callId}`;
}
