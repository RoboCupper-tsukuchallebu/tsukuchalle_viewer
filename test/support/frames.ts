// 試験用に、サーバーが送るバイナリのフレームを組み立てる。実装の parse とは別に、仕様の並びどおりに書く。
export function buildMessageDataFrame(subscriptionId: number, logTimeNanoseconds: bigint, payload: Uint8Array): Buffer {
  const header = Buffer.alloc(1 + 4 + 8);
  header.writeUInt8(0x01, 0);
  header.writeUInt32LE(subscriptionId, 1);
  header.writeBigUInt64LE(logTimeNanoseconds, 5);
  return Buffer.concat([header, payload]);
}

export function buildServiceCallResponseFrame(serviceId: number, callId: number, encoding: string, payload: Uint8Array): Buffer {
  const encodingBytes = Buffer.from(encoding, "utf8");
  const header = Buffer.alloc(1 + 4 + 4 + 4);
  header.writeUInt8(0x03, 0);
  header.writeUInt32LE(serviceId, 1);
  header.writeUInt32LE(callId, 5);
  header.writeUInt32LE(encodingBytes.length, 9);
  return Buffer.concat([header, encodingBytes, payload]);
}

export type ParsedServiceCallRequest = { serviceId: number; callId: number; encoding: string; payload: Buffer };

export function parseServiceCallRequestFrame(frame: Buffer): ParsedServiceCallRequest {
  const encodingLength = frame.readUInt32LE(9);
  return {
    serviceId: frame.readUInt32LE(1),
    callId: frame.readUInt32LE(5),
    encoding: frame.subarray(13, 13 + encodingLength).toString("utf8"),
    payload: frame.subarray(13 + encodingLength),
  };
}
