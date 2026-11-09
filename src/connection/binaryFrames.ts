import { BinaryOpcode, type ServerBinaryMessage, type ServiceCallRequest } from "./protocol.ts";

// すべて little endian。
const messageDataHeaderBytes = 1 + 4 + 8;
const serviceFrameHeaderBytes = 1 + 4 + 4 + 4;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** 知らない opcode と、短すぎる・長さが合わないフレームは undefined を返して捨てる。 */
export function parseServerBinaryFrame(frame: ArrayBuffer): ServerBinaryMessage | undefined {
  const view = new DataView(frame);
  if (view.byteLength < 1) {
    return undefined;
  }
  const opcode = view.getUint8(0);

  if (opcode === BinaryOpcode.messageData) {
    if (view.byteLength < messageDataHeaderBytes) {
      return undefined;
    }
    return {
      opcode,
      subscriptionId: view.getUint32(1, true),
      logTimeNanoseconds: view.getBigUint64(5, true),
      payload: new Uint8Array(frame, messageDataHeaderBytes),
    };
  }

  if (opcode === BinaryOpcode.serviceCallResponse) {
    if (view.byteLength < serviceFrameHeaderBytes) {
      return undefined;
    }
    const encodingLength = view.getUint32(9, true);
    const payloadOffset = serviceFrameHeaderBytes + encodingLength;
    if (payloadOffset > view.byteLength) {
      return undefined;
    }
    return {
      opcode,
      serviceId: view.getUint32(1, true),
      callId: view.getUint32(5, true),
      encoding: textDecoder.decode(new Uint8Array(frame, serviceFrameHeaderBytes, encodingLength)),
      payload: new Uint8Array(frame, payloadOffset),
    };
  }

  return undefined;
}

export function encodeServiceCallRequest(request: ServiceCallRequest): Uint8Array<ArrayBuffer> {
  const encodingBytes = textEncoder.encode(request.encoding);
  const frame = new Uint8Array(serviceFrameHeaderBytes + encodingBytes.length + request.payload.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, BinaryOpcode.serviceCallRequest);
  view.setUint32(1, request.serviceId, true);
  view.setUint32(5, request.callId, true);
  view.setUint32(9, encodingBytes.length, true);
  frame.set(encodingBytes, serviceFrameHeaderBytes);
  frame.set(request.payload, serviceFrameHeaderBytes + encodingBytes.length);
  return frame;
}
