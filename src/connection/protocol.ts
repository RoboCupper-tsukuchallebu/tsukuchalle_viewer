// Foxglove SDK 0.28.0 の WebSocket プロトコル（副プロトコル foxglove.sdk.v1）のうち、v1 で使う op だけ。
// clientPublish、fetchAsset、playback、time は作らない（受け取っても捨てる）。

export const SUBPROTOCOL = "foxglove.sdk.v1";

export const BinaryOpcode = {
  messageData: 0x01,
  serviceCallRequest: 0x02,
  serviceCallResponse: 0x03,
} as const;

export type Channel = {
  id: number;
  topic: string;
  encoding: string;
  schemaName: string;
  schema: string;
  schemaEncoding?: string;
};

export type ServiceMessageDescription = {
  encoding: string;
  schemaName: string;
  schemaEncoding?: string;
  schema: string;
};

export type ServiceDescription = {
  id: number;
  name: string;
  type: string;
  request?: ServiceMessageDescription;
  response?: ServiceMessageDescription;
};

export type ParameterValue =
  | number
  | boolean
  | string
  | ParameterValue[]
  | { [key: string]: ParameterValue };

// 小数が 1.0 のように整数に見えるときは type: "float64" を付ける。付けないと整数として扱われる。
export type ParameterType = "byte_array" | "float64" | "float64_array";

export type Parameter = {
  name: string;
  value?: ParameterValue;
  type?: ParameterType;
};

export type StatusLevel = 0 | 1 | 2;

export type ConnectionGraphUpdate = {
  publishedTopics: { name: string; publisherIds: string[] }[];
  subscribedTopics: { name: string; subscriberIds: string[] }[];
  advertisedServices: { name: string; providerIds: string[] }[];
  removedTopics: string[];
  removedServices: string[];
};

// サーバー → 画面（JSON）
export type ServerJsonMessage =
  | { op: "serverInfo"; name: string; capabilities: string[]; supportedEncodings: string[]; sessionId?: string }
  | { op: "status"; level: StatusLevel; message: string; id?: string }
  | { op: "removeStatus"; statusIds: string[] }
  | { op: "advertise"; channels: Channel[] }
  | { op: "unadvertise"; channelIds: number[] }
  | { op: "advertiseServices"; services: ServiceDescription[] }
  | { op: "unadvertiseServices"; serviceIds: number[] }
  | { op: "parameterValues"; parameters: Parameter[]; id?: string }
  | ({ op: "connectionGraphUpdate" } & ConnectionGraphUpdate)
  | { op: "serviceCallFailure"; serviceId: number; callId: number; message: string };

// サーバー → 画面（バイナリ）
export type ServerBinaryMessage =
  | { opcode: typeof BinaryOpcode.messageData; subscriptionId: number; logTimeNanoseconds: bigint; payload: Uint8Array }
  | {
      opcode: typeof BinaryOpcode.serviceCallResponse;
      serviceId: number;
      callId: number;
      encoding: string;
      payload: Uint8Array;
    };

// 画面 → サーバー（JSON）
export type ClientJsonMessage =
  | { op: "subscribe"; subscriptions: { id: number; channelId: number }[] }
  | { op: "unsubscribe"; subscriptionIds: number[] }
  | { op: "getParameters"; parameterNames: string[]; id: string }
  | { op: "setParameters"; parameters: Parameter[]; id: string }
  | { op: "subscribeParameterUpdates"; parameterNames: string[] }
  | { op: "unsubscribeParameterUpdates"; parameterNames: string[] }
  | { op: "subscribeConnectionGraph" }
  | { op: "unsubscribeConnectionGraph" };

export type ServiceCallRequest = {
  serviceId: number;
  callId: number;
  encoding: string;
  payload: Uint8Array;
};
