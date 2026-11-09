import { describe, expect, test } from "vitest";
import { parseServerJson } from "../src/connection/serverJson.ts";

describe("parseServerJson", () => {
  test("serverInfo を読む", () => {
    // Arrange・Act
    const message = parseServerJson(
      JSON.stringify({ op: "serverInfo", name: "bridge", capabilities: ["connectionGraph"], supportedEncodings: ["cdr"], sessionId: "s" }),
    );

    // Assert
    expect(message).toEqual({ op: "serverInfo", name: "bridge", capabilities: ["connectionGraph"], supportedEncodings: ["cdr"], sessionId: "s" });
  });

  test("advertise は、型の定義が無いチャネル（encoding もスキーマも空）もそのまま読む", () => {
    // Arrange・Act
    const message = parseServerJson(
      JSON.stringify({ op: "advertise", channels: [{ id: 1, topic: "/a", encoding: "", schemaName: "pkg/Type", schema: "" }] }),
    );

    // Assert
    expect(message).toEqual({ op: "advertise", channels: [{ id: 1, topic: "/a", encoding: "", schemaName: "pkg/Type", schema: "" }] });
  });

  test.each([
    ["status", { op: "status", level: 1, message: "m", id: "x" }],
    ["removeStatus", { op: "removeStatus", statusIds: ["x"] }],
    ["unadvertise", { op: "unadvertise", channelIds: [1, 2] }],
    ["unadvertiseServices", { op: "unadvertiseServices", serviceIds: [3] }],
    ["parameterValues", { op: "parameterValues", parameters: [{ name: "p", value: 1 }], id: "r" }],
    ["serviceCallFailure", { op: "serviceCallFailure", serviceId: 1, callId: 2, message: "failed" }],
  ])("%s を読む", (op, body) => {
    // Arrange・Act
    const message = parseServerJson(JSON.stringify(body));

    // Assert
    expect(message?.op).toBe(op);
    expect(message).toMatchObject(body);
  });

  test("connectionGraphUpdate は欠けた欄を空にする", () => {
    // Arrange・Act
    const message = parseServerJson(JSON.stringify({ op: "connectionGraphUpdate", publishedTopics: [{ name: "/a", publisherIds: ["n"] }] }));

    // Assert
    expect(message).toEqual({
      op: "connectionGraphUpdate",
      publishedTopics: [{ name: "/a", publisherIds: ["n"] }],
      subscribedTopics: [],
      advertisedServices: [],
      removedTopics: [],
      removedServices: [],
    });
  });

  test.each([
    ["作らない op", { op: "fetchAssetResponse" }],
    ["知らない op", { op: "somethingNew" }],
    ["必須の欄が無い", { op: "unadvertise" }],
    ["欄の型が違う", { op: "advertise", channels: [{ id: "1", topic: "/a" }] }],
    ["status の level が範囲外", { op: "status", level: 9, message: "m" }],
  ])("%s は捨てる", (_name, body) => {
    // Arrange・Act・Assert
    expect(parseServerJson(JSON.stringify(body))).toBeUndefined();
  });

  test("JSON でない文字列と配列は捨てる", () => {
    // Arrange・Act・Assert
    expect(parseServerJson("{broken")).toBeUndefined();
    expect(parseServerJson("[1,2]")).toBeUndefined();
  });
});
