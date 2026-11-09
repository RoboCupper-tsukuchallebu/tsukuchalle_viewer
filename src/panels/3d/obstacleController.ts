import { topicNames } from "../../config.ts";
import type { PanelContext } from "../../layout/panelContext.ts";
import type { ControlsForm } from "./controlsForm.ts";
import { formatObstacleStatus, obstacleUpdateIntervalMs, type createObstacleLayer } from "./obstacleLayer.ts";

export function createObstacleController(context: PanelContext, form: ControlsForm, layer: ReturnType<typeof createObstacleLayer>, refresh: () => void, report: (key: string, reason: string) => void): () => void {
  let releases: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastDraw = -Infinity;
  let pending: unknown;
  function draw(): void {
    timer = undefined;
    lastDraw = Date.now();
    report("obstacleGrid", layer.update(pending, form.unknownCells.checked) ? "" : "障害物: grid の形式を読めません");
    refresh();
  }
  function receive(value: unknown): void {
    pending = value;
    const delay = Math.max(0, obstacleUpdateIntervalMs - (Date.now() - lastDraw));
    if (delay === 0) { if (timer) clearTimeout(timer); draw(); }
    else if (!timer) timer = setTimeout(draw, delay);
  }
  function disable(): void {
    releases.forEach((release) => { release(); }); releases = [];
    if (timer) clearTimeout(timer);
    timer = undefined; lastDraw = -Infinity; pending = undefined;
    layer.clear(); form.obstacleStatus.hidden = true; report("obstacleGrid", ""); report("obstacleTransform", ""); report("obstacleZones", "");
  }
  form.obstacle.onchange = () => {
    disable();
    if (!form.obstacle.checked) return;
    form.obstacleStatus.hidden = false;
    form.obstacleStatus.textContent = formatObstacleStatus(undefined);
    releases = [context.connections.viewing.subscribeToTopic(topicNames.localGrid), context.connections.viewing.subscribeToTopic(topicNames.obstacleStatus), context.topicStore.subscribe(topicNames.localGrid, (entry) => { receive(entry.value); }), context.topicStore.subscribe(topicNames.obstacleStatus, (entry) => { form.obstacleStatus.textContent = formatObstacleStatus(entry.value); })];
    refresh();
  };
  form.unknownCells.onchange = () => { layer.redraw(form.unknownCells.checked); };
  form.zoneDimensions.forEach((input) => { input.onchange = () => { const dimensions = form.zoneDimensions.map((item) => Number(item.value)); if (dimensions.every((value) => Number.isFinite(value) && value > 0)) layer.updateZones(dimensions); }; });
  return () => { disable(); layer.dispose(); };
}
