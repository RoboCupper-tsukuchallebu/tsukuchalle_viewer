import type { ViewerConnections } from "../connection/connections.ts";
import type { FoxgloveClient } from "../connection/foxgloveClient.ts";
import type { WriteGate } from "../control/writeGate.ts";
import { connectionStateLabels } from "./connectionLabels.ts";
import { createElement } from "./dom.ts";

export type TopBar = {
  element: HTMLElement;
  /** 状態パネル（PR 3）が自己位置推定の状態を出す場所。topBar.ts は PR 1 だけが触る。 */
  localizationStatusSlot: HTMLElement;
  /** mission の停止・一時停止の処理（PR 7）。登録されるまでボタンは押せない。 */
  setStopHandler(handler: (() => void) | undefined): void;
  setPauseHandler(handler: (() => void) | undefined): void;
  dispose(): void;
};

type TopBarOptions = {
  connections: ViewerConnections;
  writeGate: WriteGate;
};

export function createTopBar({ connections, writeGate }: TopBarOptions): TopBar {
  const element = createElement("header", "top-bar");

  const connectionArea = createElement("div", "top-bar-connections");
  const localizationStatusSlot = createElement("div", "top-bar-localization");
  localizationStatusSlot.dataset["slot"] = "localization-status";

  const controlArea = createElement("div", "top-bar-controls");
  const writeSwitchLabel = createElement("label", "write-switch");
  const writeSwitch = createElement("input");
  writeSwitch.type = "checkbox";
  writeSwitch.dataset["control"] = "write-switch";
  // 場所だけ確保する。有効にできるようにするのは PR 7。
  writeSwitch.disabled = connections.writing === null;
  writeSwitch.addEventListener("change", () => { if (writeSwitch.checked) writeGate.enable(); else writeGate.disable(); });
  writeSwitch.checked = writeGate.isEnabled;
  writeSwitchLabel.append(writeSwitch, createElement("span", undefined, "書き込み"));

  const pauseButton = createStopButton("pause", "一時停止");
  const stopButton = createStopButton("stop", "停止");
  const notice = createElement(
    "p",
    "top-bar-notice",
    "画面の停止は非常停止ではありません。通信が切れると届きません。ロボットの非常停止スイッチの代わりにしないでください。",
  );
  controlArea.append(writeSwitchLabel, pauseButton, stopButton);
  element.append(connectionArea, localizationStatusSlot, controlArea, notice);

  const render = () => {
    connectionArea.replaceChildren(...describeConnections(connections));
    writeSwitch.checked = writeGate.isEnabled;
    element.classList.toggle("write-enabled", writeGate.isEnabled);
  };

  const stops = [
    ...watchedClients(connections).flatMap((client) => [
      client.on("stateChanged", render),
      client.on("serverInfo", render),
    ]),
    writeGate.subscribe(render),
  ];
  render();

  return {
    element,
    localizationStatusSlot,
    setStopHandler: (handler) => {
      bindHandler(stopButton, handler);
    },
    setPauseHandler: (handler) => {
      bindHandler(pauseButton, handler);
    },
    dispose: () => {
      stops.forEach((stop) => {
        stop();
      });
    },
  };
}

function createStopButton(control: "stop" | "pause", label: string): HTMLButtonElement {
  const button = createElement("button", `top-bar-button top-bar-${control}`, label);
  button.type = "button";
  button.dataset["control"] = control;
  button.disabled = true;
  button.title = "まだ使えません";
  return button;
}

const handlerByButton = new WeakMap<HTMLButtonElement, () => void>();

function bindHandler(button: HTMLButtonElement, handler: (() => void) | undefined): void {
  const previous = handlerByButton.get(button);
  if (previous) {
    button.removeEventListener("click", previous);
    handlerByButton.delete(button);
  }
  button.disabled = handler === undefined;
  button.title = handler === undefined ? "まだ使えません" : "";
  if (handler) {
    button.addEventListener("click", handler);
    handlerByButton.set(button, handler);
  }
}

function watchedClients({ viewing, writing }: ViewerConnections): FoxgloveClient[] {
  return writing !== null ? [viewing, writing] : [viewing];
}

function describeConnections({ viewing, writing }: ViewerConnections): HTMLElement[] {
  const writingDescription =
    writing === null
      ? createElement("p", "connection connection-unavailable", "書き込み用: なし（閲覧用の接続先が既定ではないため）")
      : describeClient("書き込み用", writing);
  return [describeClient("閲覧用", viewing), writingDescription];
}

function describeClient(label: string, client: FoxgloveClient): HTMLElement {
  const capabilities = client.serverInfo?.capabilities ?? [];
  const row = createElement("p", `connection connection-${client.state}`);
  row.dataset["connection"] = label;
  row.textContent =
    `${label}: ${connectionStateLabels[client.state]} / ${client.url} / ` +
    `capabilities: ${capabilities.length === 0 ? "なし" : capabilities.join(", ")}`;
  return row;
}
