import { expect, test } from "vitest";
import { missionResultText } from "../src/control/missionResultText.ts";

test("成功した結果と到達数を表示する", () => {
  expect(missionResultText({ status: 4, result: { success: true, message: "完了", reached_count: 2 } }))
    .toContain("成功（SUCCEEDED）、処理: 成功、到達数: 2、メッセージ: 完了");
});

test("中断の理由を表示する", () => {
  expect(missionResultText({ status: 6, result: { success: false, message: "障害物", reached_count: 1 } }))
    .toContain("中断（ABORTED）、処理: 失敗、到達数: 1、メッセージ: 障害物");
});
