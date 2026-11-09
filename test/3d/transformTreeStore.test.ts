import { expect, it } from "vitest";
import { chooseDisplayFrame } from "../../src/panels/3d/frameTransform.ts";
import { clampMaximumPoints } from "../../src/panels/3d/controlsForm.ts";
import { transformTreeFor } from "../../src/panels/3d/transformTree.ts";
import { TopicStore } from "../../src/store/topicStore.ts";

it("希望フレームを選ぶ", () => {
  expect(chooseDisplayFrame(["map", "odom"], "odom")).toBe("odom");
  expect(chooseDisplayFrame(["map"], "odom")).toBe("map");
});

it("点数を範囲内の整数にする", () => {
  expect(clampMaximumPoints("2.9", 5, 10)).toBe(2);
  expect(clampMaximumPoints("", 5, 10)).toBe(5);
  expect(clampMaximumPoints("-1", 5, 10)).toBe(1);
});

it("store ごとに木を保持する", () => {
  const store = new TopicStore();
  expect(transformTreeFor(store)).toBe(transformTreeFor(store));
  expect(transformTreeFor(store)).not.toBe(transformTreeFor(new TopicStore()));
});
