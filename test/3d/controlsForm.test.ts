// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { clampMaximumPoints, createControlsForm } from "../../src/panels/3d/controlsForm.ts";

it("velodyne の警告と変更通知がスイッチに追従する", () => {
  const form = createControlsForm();
  const listener = vi.fn();
  form.velodyne.addEventListener("change", listener);
  const warning = form.root.querySelector("span");
  expect(warning?.hidden).toBe(true);
  form.velodyne.checked = true;
  form.velodyne.dispatchEvent(new Event("change"));
  expect(warning?.hidden).toBe(false);
  form.velodyne.checked = false;
  form.velodyne.dispatchEvent(new Event("change"));
  expect(warning?.hidden).toBe(true);
  expect(listener).toHaveBeenCalledTimes(2);
});

it("点数の上限を丸め、範囲外と不正値を扱う", () => {
  expect(clampMaximumPoints("2.9", 5, 10)).toBe(2);
  expect(clampMaximumPoints("-1", 5, 10)).toBe(1);
  expect(clampMaximumPoints("100", 5, 10)).toBe(10);
  expect(clampMaximumPoints("NaN", 5, 10)).toBe(5);
});
