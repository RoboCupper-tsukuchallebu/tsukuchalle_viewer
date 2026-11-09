import { describe, expect, test } from "vitest";
import { parseWebSocketUrl, resolveConnectionUrls } from "../src/connection/connectionUrls.ts";

describe("resolveConnectionUrls", () => {
  test("既定はページを配ったホストの /ws。http なら ws:、https なら wss:", () => {
    // Arrange・Act・Assert
    expect(resolveConnectionUrls({ protocol: "http:", host: "viewer.example:8080", search: "" })).toEqual({
      viewingUrl: "ws://viewer.example:8080/ws",
      writingUrl: "ws://viewer.example:8080/ws-control",
      isViewingUrlOverridden: false,
    });
    expect(resolveConnectionUrls({ protocol: "https:", host: "viewer.example", search: "" }).viewingUrl).toBe("wss://viewer.example/ws");
  });

  test("?ws= は閲覧用だけを変え、書き込み用は作らない（偽の bridge に goal を送らせない）", () => {
    // Arrange・Act
    const urls = resolveConnectionUrls({ protocol: "http:", host: "viewer.example", search: "?ws=ws%3A%2F%2Flocalhost%3A9999" });

    // Assert
    expect(urls).toEqual({ viewingUrl: "ws://localhost:9999/", writingUrl: null, isViewingUrlOverridden: true });
  });

  test("?ws= がページと同じ接続先なら上書きとみなさない", () => {
    // Arrange・Act
    const urls = resolveConnectionUrls({ protocol: "http:", host: "viewer.example", search: "?ws=ws%3A%2F%2Fviewer.example%2Fws" });

    // Assert
    expect(urls.isViewingUrlOverridden).toBe(false);
    expect(urls.writingUrl).toBe("ws://viewer.example/ws-control");
  });

  test("?ws= が ws: / wss: でなければ無視して既定を使う", () => {
    // Arrange・Act
    const urls = resolveConnectionUrls({ protocol: "http:", host: "viewer.example", search: "?ws=javascript%3Aalert(1)" });

    // Assert
    expect(urls.viewingUrl).toBe("ws://viewer.example/ws");
    expect(urls.isViewingUrlOverridden).toBe(false);
  });

  test("?wsControl= のような別のパラメータでは書き込み用を変えられない", () => {
    // Arrange・Act
    const urls = resolveConnectionUrls({ protocol: "http:", host: "viewer.example", search: "?wsControl=ws%3A%2F%2Fevil.example%2Fws" });

    // Assert
    expect(urls.writingUrl).toBe("ws://viewer.example/ws-control");
  });
});

test.each([
  [null, undefined],
  ["", undefined],
  ["not a url", undefined],
  ["http://a.example", undefined],
  ["ws://a.example:1/x", "ws://a.example:1/x"],
])("parseWebSocketUrl(%j)", (input, expected) => {
  // Arrange・Act・Assert
  expect(parseWebSocketUrl(input)).toBe(expected);
});
