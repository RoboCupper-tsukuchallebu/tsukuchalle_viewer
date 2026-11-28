import { teleopSpeedSlider } from "../../config.ts";
import { requestConfirmation } from "../../control/confirmDialog.ts";
import {
  applyBlockedReason,
  buildChangeRequest,
  changedAxes,
  formatSpeed,
  isReadingStale,
  roundToAxisDigits,
  sliderRange,
  speedAxes,
  type AxisValues,
  type SpeedAxis,
  type TeleopSpeedReading,
} from "../../control/teleopSpeed.ts";
import { createElement } from "../../layout/dom.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import { TeleopSpeedSession } from "./teleopSpeedSession.ts";
import "./parameters.css";

const axisLabels: Record<SpeedAxis, string> = { linear: "直進", angular: "旋回" };

type AxisView = {
  current: HTMLElement;
  limit: HTMLElement;
  slider: HTMLInputElement;
  selected: HTMLElement;
};

function isSameReading(first: TeleopSpeedReading, second: TeleopSpeedReading): boolean {
  return speedAxes.every((axis) => first.current[axis] === second.current[axis] && first.limits[axis] === second.limits[axis]);
}

/** 「手動走行の最大の速さ」の区画（Issue #16 の 5.3 節）。 */
export function mountPanel(container: HTMLElement, context: PanelContext): () => void {
  const writingClient = context.connections.writing;
  /** 触ったスライダーの値。触るまでは今の値に合わせて動く。 */
  const touchedValues = new Map<SpeedAxis, number>();

  const heading = createElement("h2", undefined, "手動走行の最大の速さ");
  const description = createElement(
    "p",
    undefined,
    "パッドのスティックをいっぱいに倒したときの速さです。teleop を起動し直すと、設定ファイルの値に戻ります。",
  );
  const section = createElement("section", "teleop-speed");
  const reasonLine = createElement("p", "teleop-speed-reason");
  reasonLine.dataset["teleop"] = "reason";
  const resultLine = createElement("p", "teleop-speed-result");
  resultLine.setAttribute("role", "status");
  const applyButton = createElement("button", "teleop-speed-button", "適用");
  applyButton.type = "button";
  const resetButton = createElement("button", "teleop-speed-button", "元に戻す");
  resetButton.type = "button";
  const buttons = createElement("div", "teleop-speed-buttons");
  buttons.append(applyButton, resetButton);

  const axisViews = {} as Record<SpeedAxis, AxisView>;
  for (const axis of speedAxes) {
    const row = createElement("div", "teleop-speed-axis");
    const label = createElement("h3", undefined, axisLabels[axis]);
    const current = createElement("p");
    current.dataset["teleop"] = `${axis}-current`;
    const limit = createElement("p");
    limit.dataset["teleop"] = `${axis}-limit`;
    const slider = createElement("input", "teleop-speed-slider");
    slider.type = "range";
    slider.dataset["teleop"] = `${axis}-slider`;
    slider.setAttribute("aria-label", `${axisLabels[axis]}の最大の速さ`);
    const selected = createElement("output", "teleop-speed-selected");
    selected.dataset["teleop"] = `${axis}-selected`;
    slider.addEventListener("input", () => {
      touchedValues.set(axis, roundToAxisDigits(axis, Number(slider.value)));
      render();
    });
    row.append(label, current, limit, slider, selected);
    section.append(row);
    axisViews[axis] = { current, limit, slider, selected };
  }
  section.append(reasonLine, buttons, resultLine);

  const session = new TeleopSpeedSession(writingClient, () => {
    render();
  });

  function selection(): AxisValues | undefined {
    const reading = session.reading;
    if (reading === undefined) {
      return undefined;
    }
    return {
      linear: touchedValues.get("linear") ?? reading.current.linear,
      angular: touchedValues.get("angular") ?? reading.current.angular,
    };
  }

  function blockedReason(): string | null {
    const isStale = isReadingStale(session.lastReadAtMs, Date.now());
    return applyBlockedReason({
      isWriteEnabled: context.writeGate.isEnabled,
      hasWritingConnection: writingClient !== null,
      isWritingConnected: session.isConnected,
      isParametersAdvertised: session.isParametersAdvertised,
      reading: session.reading,
      isStale,
      selection: selection(),
      isWaitingForResponse: session.isWaitingForResponse,
    });
  }

  function render(): void {
    const reading = session.reading;
    const isStale = isReadingStale(session.lastReadAtMs, Date.now()) || !session.isConnected;
    const currentSelection = selection();
    for (const axis of speedAxes) {
      const view = axisViews[axis];
      const staleMark = isStale ? "（古い）" : "";
      view.current.textContent = reading === undefined ? "今の値: 読めていません" : `今の値: ${formatSpeed(axis, reading.current[axis])}${staleMark}`;
      view.limit.textContent = reading === undefined ? "ロボット側の上限: 読めていません" : `ロボット側の上限: ${formatSpeed(axis, reading.limits[axis])}`;
      if (reading !== undefined && currentSelection !== undefined) {
        const range = sliderRange(axis, reading.limits[axis]);
        view.slider.min = String(range.minimum);
        view.slider.max = String(range.maximum);
        view.slider.step = String(range.step);
        view.slider.value = String(currentSelection[axis]);
        view.selected.textContent = formatSpeed(axis, currentSelection[axis]);
      } else {
        view.selected.textContent = "—";
      }
      view.slider.disabled = reading === undefined || isStale || session.isWaitingForResponse;
    }
    const reason = blockedReason();
    applyButton.disabled = reason !== null;
    resetButton.disabled = touchedValues.size === 0;
    reasonLine.textContent = reason ?? "";
  }

  async function handleApplyClick(): Promise<void> {
    const reading = session.reading;
    const chosen = selection();
    if (blockedReason() !== null || reading === undefined || chosen === undefined) {
      return;
    }
    const request = buildChangeRequest(chosen, reading);
    if (!request.isValid) {
      resultLine.textContent = request.reason;
      return;
    }
    const isConfirmed = await requestConfirmation({
      title: "手動走行の最大の速さを変える",
      lines: changedAxes(chosen, reading.current).map(
        (axis) => `${axisLabels[axis]}: ${reading.current[axis].toFixed(teleopSpeedSlider[axis].fractionDigits)} → ${formatSpeed(axis, roundToAxisDigits(axis, chosen[axis]))}`,
      ),
      warnings: [
        "走行中でもすぐに反映されます。スティックを倒したまま変えると、速さが変わります。",
        ...(changedAxes(chosen, reading.current).some((axis) => roundToAxisDigits(axis, chosen[axis]) > reading.current[axis]) ? ["今より速くなります。"] : []),
      ],
      confirmLabel: "変える",
    });
    // 確認の画面を開いている間に、スイッチが無効になる・接続が切れることがある。
    if (!isConfirmed || blockedReason() !== null) {
      return;
    }
    // 確認の画面を開いている間に、ロボットの上限や今の値が変わっていたら、確認した内容では送らない。
    const latestReading = session.reading;
    if (latestReading === undefined || !isSameReading(reading, latestReading)) {
      resultLine.textContent = "ロボットの値が変わったので、送りませんでした。もう一度確認してください";
      resultLine.classList.add("is-error");
      render();
      return;
    }
    const outcome = await session.apply(request.parameters, request.requested);
    resultLine.textContent = outcome.messages.join(" / ");
    resultLine.classList.toggle("is-error", outcome.isError);
    // 選んだ値を捨ててよいのは、ロボットが受け付けた軸だけ（拒否・応答なし・切断では残す）。
    for (const axis of outcome.acceptedAxes) {
      touchedValues.delete(axis);
    }
    render();
  }

  applyButton.addEventListener("click", () => {
    void handleApplyClick();
  });
  resetButton.addEventListener("click", () => {
    touchedValues.clear();
    render();
  });

  container.replaceChildren(heading, description, section);
  const unsubscribeWriteGate = context.writeGate.subscribe(render);
  if (writingClient === null) {
    resultLine.textContent = "閲覧先を変えているので、書き込み用の接続がありません。この画面は使えません";
  }
  render();
  session.start();

  return () => {
    session.dispose();
    unsubscribeWriteGate();
    container.replaceChildren();
  };
}
