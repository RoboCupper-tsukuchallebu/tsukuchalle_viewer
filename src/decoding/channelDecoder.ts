import { parse } from "@foxglove/rosmsg";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";

/** デコードできるかを理由つきで返す。「できない」を一覧に出すため、例外ではなく値にする。 */
export type DecoderResult =
  | { isDecodable: true; decode: (payload: Uint8Array) => unknown }
  | { isDecodable: false; reason: string };

export type EncodedChannel = { encoding: string; schema: string; schemaEncoding?: string };

const textDecoder = new TextDecoder();

/** チャネルの encoding で分ける: cdr（ROS 2）と json だけ。それ以外（ros2idl など）と、スキーマの無い cdr は購読しない。 */
export function createChannelDecoder(channel: EncodedChannel): DecoderResult {
  if (channel.encoding === "json") {
    return { isDecodable: true, decode: (payload) => JSON.parse(textDecoder.decode(payload)) as unknown };
  }
  if (channel.encoding !== "cdr") {
    // bridge は型の定義が見つからないトピックを、encoding もスキーマも空で advertise する。
    return { isDecodable: false, reason: channel.encoding === "" ? "型の定義が無い" : `未対応の encoding: ${channel.encoding}` };
  }
  if (channel.schemaEncoding !== undefined && channel.schemaEncoding !== "ros2msg") {
    return { isDecodable: false, reason: `未対応のスキーマ: ${channel.schemaEncoding}` };
  }
  if (channel.schema === "") {
    return { isDecodable: false, reason: "型の定義が無い" };
  }
  try {
    const reader = new MessageReader(parse(channel.schema, { ros2: true }));
    return { isDecodable: true, decode: (payload) => reader.readMessage(payload) };
  } catch (error) {
    return { isDecodable: false, reason: `スキーマを解析できない: ${errorMessage(error)}` };
  }
}

/** サービスの request を書く。encoding は cdr だけ（bridge は cdr 以外を受け付けない）。 */
export function createCdrEncoder(schema: string): (message: unknown) => Uint8Array {
  const writer = new MessageWriter(parse(schema, { ros2: true }));
  return (message) => writer.writeMessage(message);
}

export function createCdrDecoder(schema: string): (payload: Uint8Array) => unknown {
  const reader = new MessageReader(parse(schema, { ros2: true }));
  return (payload) => reader.readMessage(payload);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
