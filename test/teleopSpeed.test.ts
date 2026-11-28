import { describe, expect, test } from "vitest";
import { teleopSpeedParameterNames as names } from "../src/config.ts";
import {
  applyBlockedReason,
  buildChangeRequest,
  isReadingStale,
  judgeChangeResponse,
  parseTeleopSpeedReading,
  type ApplyConditionInput,
  type TeleopSpeedReading,
} from "../src/control/teleopSpeed.ts";

function readingWith(limits: { linear: number; angular: number }, current: { linear: number; angular: number }): TeleopSpeedReading {
  return { current, limits };
}

describe("送る内容（V1・V2）", () => {
  test("変わるものだけが入り、どの値にも float64 が付く", () => {
    const reading = readingWith({ linear: 1.5, angular: 4 }, { linear: 0.6, angular: 1.5 });
    const request = buildChangeRequest({ linear: 1.0, angular: 1.5 }, reading);
    expect(request).toMatchObject({ isValid: true, parameters: [{ name: names.linear, value: 1, type: "float64" }] });
    expect(JSON.stringify(request.isValid ? request.parameters : [])).toContain('"value":1,');
  });

  test("小数に見える値にも float64 が付く", () => {
    const reading = readingWith({ linear: 1.5, angular: 4 }, { linear: 1.0, angular: 1.0 });
    const request = buildChangeRequest({ linear: 0.6, angular: 2.0 }, reading);
    expect(request.isValid && request.parameters).toEqual([
      { name: names.linear, value: 0.6, type: "float64" },
      { name: names.angular, value: 2, type: "float64" },
    ]);
  });

  test("最小未満・数でない値は送らない", () => {
    const reading = readingWith({ linear: 1.5, angular: 4 }, { linear: 0.6, angular: 1.5 });
    expect(buildChangeRequest({ linear: 0.05, angular: 1.5 }, reading).isValid).toBe(false);
    expect(buildChangeRequest({ linear: Number.NaN, angular: 1.5 }, reading).isValid).toBe(false);
    expect(buildChangeRequest({ linear: 0.6, angular: 0.2 }, reading).isValid).toBe(false);
  });

  test("上限は読んだ値を使う。上限 0.4 のとき 0.5 は送れない", () => {
    const reading = readingWith({ linear: 0.4, angular: 1 }, { linear: 0.3, angular: 0.5 });
    expect(buildChangeRequest({ linear: 0.5, angular: 0.5 }, reading).isValid).toBe(false);
    expect(buildChangeRequest({ linear: 0.4, angular: 0.5 }, reading).isValid).toBe(true);
  });

  test("浮動小数点の誤差を丸めて送る", () => {
    const reading = readingWith({ linear: 1.5, angular: 4 }, { linear: 0.6, angular: 1.5 });
    const request = buildChangeRequest({ linear: 0.1 + 0.2, angular: 1.5 }, reading);
    expect(request.isValid && request.parameters[0]?.value).toBe(0.3);
  });
});

describe("返事の判定（V3）", () => {
  const requested = { linear: 0.4, angular: 1 };
  test("同じ値なら成功", () => {
    const result = judgeChangeResponse(requested, [{ name: names.linear, value: 0.4 }, { name: names.angular, value: 1 }]);
    expect(result).toEqual({ linear: "accepted", angular: "accepted" });
  });
  test("違う値・名前が無い・値が無いなら受け付けられていない。直進と旋回で分かれる", () => {
    expect(judgeChangeResponse(requested, [{ name: names.linear, value: 0.4 }, { name: names.angular, value: 1.5 }])).toEqual({ linear: "accepted", angular: "rejected" });
    expect(judgeChangeResponse(requested, [{ name: names.angular, value: 1 }])).toEqual({ linear: "rejected", angular: "accepted" });
    expect(judgeChangeResponse(requested, [{ name: names.linear }, { name: names.angular, value: 1 }])).toEqual({ linear: "rejected", angular: "accepted" });
    expect(judgeChangeResponse(requested, [])).toEqual({ linear: "rejected", angular: "rejected" });
  });
  test("頼んでいない軸は判定しない", () => {
    expect(judgeChangeResponse({ linear: 0.4 }, [{ name: names.linear, value: 0.4 }])).toEqual({ linear: "accepted", angular: "not-requested" });
  });
});

describe("読み戻し", () => {
  test("4 つが数で読めたときだけ読めたことにする", () => {
    const all = [
      { name: names.linear, value: 0.6 },
      { name: names.angular, value: 1.5 },
      { name: names.linearLimit, value: 0.6 },
      { name: names.angularLimit, value: 1.5 },
    ];
    expect(parseTeleopSpeedReading(all)).toEqual({ current: { linear: 0.6, angular: 1.5 }, limits: { linear: 0.6, angular: 1.5 } });
    expect(parseTeleopSpeedReading(all.slice(0, 3))).toBeNull();
    expect(parseTeleopSpeedReading([...all.slice(0, 3), { name: names.angularLimit, value: "x" }])).toBeNull();
  });
});

describe("古さの判定（V4）", () => {
  test("最後に読めてから 5 秒を超えたら古い", () => {
    expect(isReadingStale(1000, 6000)).toBe(false);
    expect(isReadingStale(1000, 6001)).toBe(true);
    expect(isReadingStale(undefined, 0)).toBe(true);
  });
});

describe("適用できない理由", () => {
  const reading = readingWith({ linear: 0.6, angular: 1.5 }, { linear: 0.6, angular: 1.5 });
  const ready: ApplyConditionInput = {
    isWriteEnabled: true, hasWritingConnection: true, isWritingConnected: true, isParametersAdvertised: true,
    reading, isStale: false, selection: { linear: 0.4, angular: 1.5 }, isWaitingForResponse: false,
  };
  test("すべて満たせば押せる", () => {
    expect(applyBlockedReason(ready)).toBeNull();
  });
  test.each([
    ["書き込みのスイッチが無効です", { isWriteEnabled: false }],
    ["書き込み用の接続が切れています", { isWritingConnected: false }],
    ["ロボット側の上限が読めません", { reading: undefined }],
    ["古い", { isStale: true }],
    ["同じです", { selection: { linear: 0.6, angular: 1.5 } }],
    ["返事を待っています", { isWaitingForResponse: true }],
    ["書き込み用の接続がありません", { hasWritingConnection: false }],
  ])("%s", (expected, override) => {
    expect(applyBlockedReason({ ...ready, ...override })).toContain(expected);
  });
});
