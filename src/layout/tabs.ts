import { storageKeys } from "../config.ts";
import { createChannelListPanel } from "../channels/channelListPanel.ts";
import { createElement } from "./dom.ts";
import type { MountPanel, PanelContext } from "./panelContext.ts";
import { readStoredText, writeStoredText } from "./safeStorage.ts";

export type TabDefinition = {
  id: string;
  label: string;
  /** 開いたときに読み込む（動的 import）。 */
  load: () => Promise<MountPanel>;
};

/** 3D のタブの中で waypoint の編集も行う（仕様 4.2 節）。 */
async function loadThreeDimensionalTab(): Promise<MountPanel> {
  const [threeDimensional, waypoints] = await Promise.all([import("../panels/3d/index.ts"), import("../panels/waypoints/index.ts")]);
  return (container, context) => {
    const viewArea = createElement("div", "panel-3d");
    const waypointArea = createElement("div", "panel-waypoints");
    container.replaceChildren(viewArea, waypointArea);
    const disposeView = threeDimensional.mountPanel(viewArea, context);
    const disposeWaypoints = waypoints.mountPanel(waypointArea, context);
    return () => {
      disposeView();
      disposeWaypoints();
    };
  };
}

export const tabDefinitions: TabDefinition[] = [
  { id: "3d", label: "3D", load: loadThreeDimensionalTab },
  { id: "waypoints", label: "Waypoints", load: async () => (await import("../panels/waypoints/index.ts")).mountPanel },
  { id: "map", label: "地図", load: async () => (await import("../panels/map/index.ts")).mountPanel },
  { id: "satellites", label: "衛星", load: async () => (await import("../panels/satellites/index.ts")).mountPanel },
  { id: "status", label: "状態", load: async () => (await import("../panels/status/index.ts")).mountPanel },
  { id: "parameters", label: "パラメータ", load: async () => (await import("../panels/parameters/index.ts")).mountPanel },
  { id: "channels", label: "チャネル", load: () => Promise.resolve(createChannelListPanel) },
];

export type Tabs = { element: HTMLElement; select(tabId: string): Promise<void>; dispose(): void };

export function createTabs(context: PanelContext, definitions: TabDefinition[] = tabDefinitions): Tabs {
  const element = createElement("div", "tabs");
  const tabList = createElement("nav", "tab-list");
  tabList.setAttribute("role", "tablist");
  const content = createElement("main", "tab-content");
  element.append(tabList, content);

  const buttons = new Map<string, HTMLButtonElement>();
  let disposeCurrentPanel: (() => void) | undefined;
  let selectionCounter = 0;

  const select = async (tabId: string): Promise<void> => {
    const definition = definitions.find((candidate) => candidate.id === tabId) ?? definitions[0];
    if (!definition) {
      return;
    }
    const thisSelection = ++selectionCounter;
    buttons.forEach((button, id) => {
      button.setAttribute("aria-selected", String(id === definition.id));
    });
    writeStoredText(storageKeys.selectedTab, definition.id);
    const mountPanel = await definition.load();
    if (thisSelection !== selectionCounter) {
      return; // 読み込み中に別のタブが選ばれた
    }
    disposeCurrentPanel?.();
    content.replaceChildren();
    disposeCurrentPanel = mountPanel(content, context);
  };

  for (const definition of definitions) {
    const button = createElement("button", "tab-button", definition.label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.dataset["tab"] = definition.id;
    button.addEventListener("click", () => {
      void select(definition.id);
    });
    buttons.set(definition.id, button);
    tabList.append(button);
  }

  void select(readStoredText(storageKeys.selectedTab) ?? definitions[0]?.id ?? "");

  return {
    element,
    select,
    dispose: () => {
      selectionCounter += 1;
      disposeCurrentPanel?.();
    },
  };
}
