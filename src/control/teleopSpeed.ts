import { staleThresholdMs, teleopSpeedParameterNames, teleopSpeedSlider } from "../config.ts";
import type { Parameter } from "../connection/protocol.ts";

export type SpeedAxis = "linear" | "angular";
export const speedAxes: readonly SpeedAxis[] = ["linear", "angular"];

export type AxisValues = { readonly linear: number; readonly angular: number };

/** ロボットから読み戻した今の値と上限。 */
export type TeleopSpeedReading = {
  readonly current: AxisValues;
  readonly limits: AxisValues;
};

/** 読み戻した結果。4 つのうち 1 つでも数で読めなければ null。 */
export function parseTeleopSpeedReading(parameters: readonly Parameter[]): TeleopSpeedReading | null {
  const valueOf = (name: string): number | undefined => {
    const value = parameters.find((parameter) => parameter.name === name)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const linear = valueOf(teleopSpeedParameterNames.linear);
  const angular = valueOf(teleopSpeedParameterNames.angular);
  const linearLimit = valueOf(teleopSpeedParameterNames.linearLimit);
  const angularLimit = valueOf(teleopSpeedParameterNames.angularLimit);
  if (linear === undefined || angular === undefined || linearLimit === undefined || angularLimit === undefined) {
    return null;
  }
  return { current: { linear, angular }, limits: { linear: linearLimit, angular: angularLimit } };
}

/** 読みたい 4 つの名前。 */
export function teleopSpeedParameterNamesToRead(): string[] {
  return Object.values(teleopSpeedParameterNames);
}

/** 最後に読めてから staleThresholdMs.status を超えたら古い。一度も読めていなければ古い。 */
export function isReadingStale(lastReadAtMs: number | undefined, nowMs: number): boolean {
  return lastReadAtMs === undefined || nowMs - lastReadAtMs > staleThresholdMs.status;
}

/** 1 つの軸の選べる範囲。最大はロボットから読んだ上限。 */
export function sliderRange(axis: SpeedAxis, limit: number): { minimum: number; maximum: number; step: number } {
  return { minimum: teleopSpeedSlider[axis].minimum, maximum: limit, step: teleopSpeedSlider[axis].step };
}

/** 画面で確かめる範囲（防護ではない。無駄な要求を出さないため）。 */
export function isWithinRange(axis: SpeedAxis, value: number, limit: number): boolean {
  return Number.isFinite(value) && value >= teleopSpeedSlider[axis].minimum && value <= limit;
}

/** 浮動小数点の誤差を、表示の桁数に丸めて取り除く。 */
export function roundToAxisDigits(axis: SpeedAxis, value: number): number {
  return Number(value.toFixed(teleopSpeedSlider[axis].fractionDigits));
}

export function formatSpeed(axis: SpeedAxis, value: number): string {
  return `${value.toFixed(teleopSpeedSlider[axis].fractionDigits)} ${teleopSpeedSlider[axis].unit}`;
}

/** 変わる軸だけ。値は丸めたもの。 */
export function changedAxes(selection: AxisValues, current: AxisValues): SpeedAxis[] {
  return speedAxes.filter((axis) => roundToAxisDigits(axis, selection[axis]) !== current[axis]);
}

export type ChangeRequest =
  | { readonly isValid: true; readonly requested: Partial<Record<SpeedAxis, number>>; readonly parameters: Parameter[] }
  | { readonly isValid: false; readonly reason: string };

const parameterNameByAxis: Record<SpeedAxis, string> = {
  linear: teleopSpeedParameterNames.linear,
  angular: teleopSpeedParameterNames.angular,
};

/**
 * 送る内容を作る。変わるものだけを入れ、どの値にも type: "float64" を付ける
 * （付けないと、1.0 が JSON で 1 になり、ブリッジが整数として渡してノードが拒む）。
 */
export function buildChangeRequest(selection: AxisValues, reading: TeleopSpeedReading): ChangeRequest {
  const requested: Partial<Record<SpeedAxis, number>> = {};
  const parameters: Parameter[] = [];
  for (const axis of changedAxes(selection, reading.current)) {
    const value = roundToAxisDigits(axis, selection[axis]);
    if (!isWithinRange(axis, value, reading.limits[axis])) {
      return { isValid: false, reason: "選んだ値が範囲の外です" };
    }
    requested[axis] = value;
    parameters.push({ name: parameterNameByAxis[axis], value, type: "float64" });
  }
  if (parameters.length === 0) {
    return { isValid: false, reason: "今の値と同じです" };
  }
  return { isValid: true, requested, parameters };
}

/** 返ってきた値が頼んだ値と同じなら受け付けられた。名前が無い・値が無い・違う値は受け付けられていない。 */
export function judgeChangeResponse(
  requested: Partial<Record<SpeedAxis, number>>,
  response: readonly Parameter[],
): Record<SpeedAxis, "accepted" | "rejected" | "not-requested"> {
  const judge = (axis: SpeedAxis): "accepted" | "rejected" | "not-requested" => {
    const requestedValue = requested[axis];
    if (requestedValue === undefined) {
      return "not-requested";
    }
    const returned = response.find((parameter) => parameter.name === parameterNameByAxis[axis])?.value;
    return returned === requestedValue ? "accepted" : "rejected";
  };
  return { linear: judge("linear"), angular: judge("angular") };
}

export type ApplyConditionInput = {
  readonly isWriteEnabled: boolean;
  readonly hasWritingConnection: boolean;
  readonly isWritingConnected: boolean;
  readonly isParametersAdvertised: boolean;
  readonly reading: TeleopSpeedReading | undefined;
  readonly isStale: boolean;
  readonly selection: AxisValues | undefined;
  readonly isWaitingForResponse: boolean;
};

/** 「適用」を押せない理由。押せるなら null。 */
export function applyBlockedReason(input: ApplyConditionInput): string | null {
  if (!input.hasWritingConnection) {
    return "閲覧先を変えているので、書き込み用の接続がありません。この画面は使えません";
  }
  if (!input.isWriteEnabled) {
    return "書き込みのスイッチが無効です";
  }
  if (!input.isWritingConnected) {
    return "書き込み用の接続が切れています";
  }
  if (!input.isParametersAdvertised) {
    return "ブリッジがパラメータの機能を申し出ていません";
  }
  if (input.reading === undefined) {
    return "ロボット側の上限が読めません（teleop が動いていないか、上限つきの版ではありません）";
  }
  if (input.isStale) {
    return "今の値が古いので、適用できません";
  }
  if (input.selection === undefined || changedAxes(input.selection, input.reading.current).length === 0) {
    return "スライダーの値が今の値と同じです";
  }
  if (input.isWaitingForResponse) {
    return "前の適用の返事を待っています";
  }
  return null;
}
