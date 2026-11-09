import { pointCloudLimits, topicNames } from "../../config.ts";

export function clampMaximumPoints(text: string, fallback: number, upperBound: number): number {
  const value = Number(text);
  if (!text.trim() || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(upperBound, Math.floor(value)));
}

export function createControlsForm() {
  const root = document.createElement("div");
  root.className = "view-3d-controls";
  const label = (text: string, input: HTMLElement) => {
    const element = document.createElement("label");
    element.append(text, input);
    root.append(element);
  };
  const frame = document.createElement("select");
  const initial = document.createElement("option");
  initial.textContent = "map";
  frame.append(initial);
  label("表示フレーム ", frame);
  const numberInput = (text: string, value: number) => {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(pointCloudLimits.savedMapMaximumPoints);
    input.value = String(value);
    label(text, input);
    return input;
  };
  const limit = numberInput("点数の上限 ", pointCloudLimits.defaultMaximumPoints);
  const mapLimit = numberInput("地図の点数の上限 ", pointCloudLimits.savedMapMaximumPoints);
  const velodyne = document.createElement("input");
  velodyne.type = "checkbox";
  label("velodyne を表示 ", velodyne);
  const obstacle = document.createElement("input");
  obstacle.type = "checkbox";
  label("障害物を表示 ", obstacle);
  const unknownCells = document.createElement("input");
  unknownCells.type = "checkbox";
  label("不明セルを表示 ", unknownCells);
  const zoneDefinitions: [string, number][] = [
    ["stop 前方 (m) ", 1.0],
    ["stop 幅 (m) ", 0.8],
    ["slow 前方 (m) ", 2.5],
    ["slow 幅 (m) ", 1.2],
  ];
  const zoneDimensions = zoneDefinitions.map(([text, value]) => {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.01";
    input.step = "0.1";
    input.value = String(value);
    label(text, input);
    return input;
  });
  const zoneSource = document.createElement("span");
  zoneSource.hidden = true;
  zoneSource.setAttribute("role", "status");
  const zoneWarning = document.createElement("span");
  zoneWarning.setAttribute("role", "alert");
  const obstacleStatus = document.createElement("span");
  obstacleStatus.hidden = true;
  const warning = document.createElement("span");
  warning.textContent = "約 1.5 MB × 10 Hz。細い回線では遅れることがあります。";
  warning.hidden = true;
  root.append(warning, obstacleStatus, zoneSource, zoneWarning);
  velodyne.addEventListener("change", () => {
    warning.hidden = !velodyne.checked;
  });
  const topicInput = (text: string, value: string) => {
    const input = document.createElement("input");
    input.value = value;
    label(text, input);
    return input;
  };
  const mapInput = topicInput("保存地図 ", topicNames.savedMap);
  const trajectoryInput = topicInput("軌跡 ", topicNames.savedTrajectory);
  return { root, frame, limit, mapLimit, velodyne, obstacle, unknownCells, zoneDimensions, obstacleStatus, zoneSource, zoneWarning, mapInput, trajectoryInput };
}

export type ControlsForm = ReturnType<typeof createControlsForm>;
