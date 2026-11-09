import { describe, expect, test } from "vitest";
import { encodeServiceCallRequest, parseServerBinaryFrame } from "../src/connection/binaryFrames.ts";
import { buildMessageDataFrame, buildServiceCallResponseFrame, parseServiceCallRequestFrame } from "./support/frames.ts";

const toArrayBuffer = (buffer: Buffer): ArrayBuffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

describe("parseServerBinaryFrame", () => {
  test("0x01 message data を little endian で読む", () => {
    // Arrange
    const frame = buildMessageDataFrame(0x01020304, 0x0102030405060708n, Buffer.from([0xaa, 0xbb]));

    // Act
    const message = parseServerBinaryFrame(toArrayBuffer(frame));

    // Assert
    expect(message).toMatchObject({ opcode: 0x01, subscriptionId: 0x01020304, logTimeNanoseconds: 0x0102030405060708n });
    expect([...(message?.payload ?? [])]).toEqual([0xaa, 0xbb]);
  });

  test("0x03 service call response を読む", () => {
    // Arrange
    const frame = buildServiceCallResponseFrame(11, 22, "cdr", Buffer.from([1, 2, 3]));

    // Act
    const message = parseServerBinaryFrame(toArrayBuffer(frame));

    // Assert
    expect(message).toMatchObject({ opcode: 0x03, serviceId: 11, callId: 22, encoding: "cdr" });
    expect([...(message?.payload ?? [])]).toEqual([1, 2, 3]);
  });

  test("知らない opcode と、短すぎる・長さが合わないフレームは捨てる", () => {
    // Arrange・Act・Assert
    expect(parseServerBinaryFrame(new ArrayBuffer(0))).toBeUndefined();
    expect(parseServerBinaryFrame(Uint8Array.from([0x7f, 1, 2, 3]).buffer)).toBeUndefined();
    expect(parseServerBinaryFrame(Uint8Array.from([0x01, 1, 2]).buffer)).toBeUndefined();
    const truncatedResponse = buildServiceCallResponseFrame(1, 2, "cdr", Buffer.alloc(0)).subarray(0, 14);
    expect(parseServerBinaryFrame(toArrayBuffer(truncatedResponse))).toBeUndefined();
  });
});

describe("encodeServiceCallRequest", () => {
  test("0x02 を仕様の並びで組み立てる", () => {
    // Arrange・Act
    const frame = Buffer.from(encodeServiceCallRequest({ serviceId: 258, callId: 772, encoding: "cdr", payload: Uint8Array.from([9, 8, 7]) }));

    // Assert
    expect([...frame]).toEqual([0x02, 2, 1, 0, 0, 4, 3, 0, 0, 3, 0, 0, 0, 0x63, 0x64, 0x72, 9, 8, 7]);
    expect(parseServiceCallRequestFrame(frame)).toMatchObject({ serviceId: 258, callId: 772, encoding: "cdr" });
  });
});
