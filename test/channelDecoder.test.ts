import { describe, expect, test } from "vitest";
import { createCdrDecoder, createCdrEncoder, createChannelDecoder } from "../src/decoding/channelDecoder.ts";

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
const fromHex = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, "hex"));

// bridge と同じ形: 型の定義を ==== で区切って連結した ros2msg
const headerSchema = `std_msgs/Header header
float64 x
string[] names
====
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
====
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;

describe("cdr", () => {
  test("手で並べたバイト列を読める（int32 の後ろで float64 は 8 バイト境界に揃う）", () => {
    // Arrange: 4 バイトのヘッダー 00 01 00 00（little endian）、a = 1、4 バイトの詰め物、b = 1.5
    const channel = { encoding: "cdr", schemaEncoding: "ros2msg", schema: "int32 a\nfloat64 b" };
    const bytes = fromHex("00010000" + "01000000" + "00000000" + "000000000000f83f");

    // Act
    const decoder = createChannelDecoder(channel);

    // Assert
    expect(decoder.isDecodable && decoder.decode(bytes)).toEqual({ a: 1, b: 1.5 });
  });

  test("手で並べたバイト列を MessageWriter が同じバイトで書く", () => {
    // Arrange
    const encode = createCdrEncoder("int32 a\nfloat64 b");

    // Act
    const bytes = encode({ a: 1, b: 1.5 });

    // Assert
    expect(hex(bytes)).toBe("00010000" + "01000000" + "00000000" + "000000000000f83f");
  });

  test("文字列は長さ（終端の NUL を含む）と NUL つきで並ぶ", () => {
    // Arrange: bool success、string message = "ok"（長さ 3）
    const decode = createCdrDecoder("bool success\nstring message");
    const bytes = fromHex("00010000" + "01000000" + "03000000" + "6f6b00");

    // Act・Assert
    expect(decode(bytes)).toEqual({ success: true, message: "ok" });
  });

  test("入れ子の型・配列・文字列を MessageWriter で書いて MessageReader で読み戻せる", () => {
    // Arrange
    const message = { header: { stamp: { sec: 1, nanosec: 2 }, frame_id: "map" }, x: 1.5, names: ["a", "bc"] };

    // Act
    const decoded = createCdrDecoder(headerSchema)(createCdrEncoder(headerSchema)(message));

    // Assert
    expect(decoded).toEqual(message);
  });

  test("型の定義が無い（bridge が空で advertise したもの）はデコードできないと分かる", () => {
    // Arrange・Act
    const decoder = createChannelDecoder({ encoding: "", schema: "" });

    // Assert
    expect(decoder).toMatchObject({ isDecodable: false, reason: "型の定義が無い" });
  });

  test("ros2idl は購読しない", () => {
    // Arrange・Act
    const decoder = createChannelDecoder({ encoding: "cdr", schemaEncoding: "ros2idl", schema: "module x {};" });

    // Assert
    expect(decoder.isDecodable).toBe(false);
  });

  test("スキーマが壊れていても落ちずに、できないと分かる", () => {
    // Arrange・Act
    const decoder = createChannelDecoder({ encoding: "cdr", schemaEncoding: "ros2msg", schema: "NotAType\n???" });

    // Assert
    expect(decoder.isDecodable).toBe(false);
  });
});

describe("json", () => {
  test("JSON.parse で読む", () => {
    // Arrange
    const decoder = createChannelDecoder({ encoding: "json", schema: "" });

    // Act・Assert
    expect(decoder.isDecodable && decoder.decode(new TextEncoder().encode('{"total_cpu_percent": 12.5}'))).toEqual({
      total_cpu_percent: 12.5,
    });
  });
});

test("cdr と json 以外の encoding は理由つきでできないと分かる", () => {
  // Arrange・Act
  const decoder = createChannelDecoder({ encoding: "protobuf", schema: "x" });

  // Assert
  expect(decoder).toEqual({ isDecodable: false, reason: "未対応の encoding: protobuf" });
});
