import { topicNames } from "../../config.ts";
import type { Parameter } from "../../connection/protocol.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import type { ControlsForm } from "./controlsForm.ts";
import { formatObstacleStatus, obstacleUpdateIntervalMs, type createObstacleLayer } from "./obstacleLayer.ts";

const parameterNames = [
  "/obstacle_monitor.stop_zone_x_m",
  "/obstacle_monitor.stop_zone_y_half_m",
  "/obstacle_monitor.slow_zone_x_m",
  "/obstacle_monitor.slow_zone_y_half_m",
];

export function createObstacleController(context: PanelContext, form: ControlsForm, layer: ReturnType<typeof createObstacleLayer>, refresh: () => void, report: (key: string, reason: string) => void): () => void {
  const client = context.connections.viewing;
  let releases: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastDraw = -Infinity;
  let pending: unknown;
  let generation = 0;
  const parameterValues = new Map<string, unknown>();
  const updatedParameterNames = new Set<string>();

  function updateDimensions(): void {
    const inputValues = form.zoneDimensions.map((input) => input.value.trim() === "" ? NaN : Number(input.value));
    const validInputs = inputValues.every((value) => Number.isFinite(value) && value > 0);
    form.zoneWarning.textContent = validInputs ? "" : "ゾーン寸法はすべて 0 より大きい数値を入力してください";
    const values = parameterNames.map((name) => parameterValues.get(name));
    const validParameters = values.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
    form.zoneSource.textContent = validParameters ? "ゾーン寸法: パラメータ" : "ゾーン寸法: 入力欄";
    if (validParameters) {
      const dimensions = values as number[];
      layer.updateZones([dimensions[0] ?? 0, (dimensions[1] ?? 0) * 2, dimensions[2] ?? 0, (dimensions[3] ?? 0) * 2]);
    } else if (validInputs) {
      layer.updateZones(inputValues);
    }
  }
  function receiveParameters(parameters: Parameter[]): void {
    parameters.forEach((parameter) => {
      if (parameterNames.includes(parameter.name)) parameterValues.set(parameter.name, parameter.value);
    });
    updateDimensions();
  }
  function requestParameters(): void {
    const requestGeneration = ++generation;
    parameterValues.clear();
    updatedParameterNames.clear();
    updateDimensions();
    void client.getParameters(parameterNames).then((parameters) => {
      if (generation === requestGeneration) {
        receiveParameters(parameters.filter((parameter) => !updatedParameterNames.has(parameter.name)));
      }
    }).catch(() => {
      if (generation === requestGeneration) {
        updateDimensions();
      }
    });
  }
  function draw(): void {
    timer = undefined;
    lastDraw = Date.now();
    report("obstacleGrid", layer.update(pending, form.unknownCells.checked) ? "" : "障害物: grid の形式を読めません");
    refresh();
  }
  function receive(value: unknown): void {
    pending = value;
    const delay = Math.max(0, obstacleUpdateIntervalMs - (Date.now() - lastDraw));
    if (delay === 0) {
      if (timer) clearTimeout(timer);
      draw();
    } else if (!timer) {
      timer = setTimeout(draw, delay);
    }
  }
  function disable(): void {
    generation++;
    releases.forEach((release) => { release(); });
    releases = [];
    if (timer) clearTimeout(timer);
    timer = undefined;
    lastDraw = -Infinity;
    pending = undefined;
    parameterValues.clear();
    layer.clear();
    form.obstacleStatus.hidden = true;
    form.zoneSource.hidden = true;
    form.zoneWarning.textContent = "";
    report("obstacleGrid", "");
    report("obstacleTransform", "");
    report("obstacleZones", "");
  }
  form.obstacle.onchange = () => {
    disable();
    if (!form.obstacle.checked) return;
    form.obstacleStatus.hidden = false;
    form.zoneSource.hidden = false;
    form.obstacleStatus.textContent = formatObstacleStatus(undefined);
    releases = [
      client.subscribeToTopic(topicNames.localGrid),
      client.subscribeToTopic(topicNames.obstacleStatus),
      context.topicStore.subscribe(topicNames.localGrid, (entry) => { receive(entry.value); }),
      context.topicStore.subscribe(topicNames.obstacleStatus, (entry) => {
        form.obstacleStatus.textContent = formatObstacleStatus(entry.value);
        layer.updateStatus(entry.value);
        refresh();
      }),
      client.on("parameterValues", (parameters) => {
        parameters.forEach((parameter) => { updatedParameterNames.add(parameter.name); });
        receiveParameters(parameters);
      }),
      client.on("stateChanged", (state) => {
        if (state === "connected") requestParameters();
        else {
          generation++;
          parameterValues.clear();
          updateDimensions();
        }
      }),
    ];
    client.subscribeParameterUpdates(parameterNames);
    releases.push(() => { client.unsubscribeParameterUpdates(parameterNames); });
    requestParameters();
    refresh();
  };
  form.unknownCells.onchange = () => { layer.redraw(form.unknownCells.checked); };
  form.zoneDimensions.forEach((input) => {
    input.onchange = () => { if (form.obstacle.checked) updateDimensions(); };
  });
  return () => {
    disable();
    layer.dispose();
  };
}
