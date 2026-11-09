import type { PanelContext } from "./panelContext.ts";

/** 中身を作るまでの空の枠。各パネルの PR が、自分のフォルダの index.ts でこれを置き換える。 */
export function createPlaceholderPanel(title: string): (container: HTMLElement, context: PanelContext) => () => void {
  return (container) => {
    const message = document.createElement("p");
    message.className = "placeholder";
    message.textContent = `${title}: まだ作っていません。`;
    container.replaceChildren(message);
    return () => {
      container.replaceChildren();
    };
  };
}
