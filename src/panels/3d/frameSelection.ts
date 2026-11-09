import { frameNames, storageKeys } from "../../config.ts";
import { readStoredText, writeStoredText } from "../../layout/safeStorage.ts";
import { chooseDisplayFrame } from "./frameTransform.ts";
import type { TransformTree } from "./transformTree.ts";

export function createFrameSelection(
  select: HTMLSelectElement,
  transformTree: TransformTree,
  onChange: () => void,
) {
  let preferredFrame = readStoredText(storageKeys.selected3dFrame) ?? frameNames.map;
  let selectedFrame: string = frameNames.map;
  let previousFrames = "";
  select.onchange = () => {
    preferredFrame = select.value;
    selectedFrame = preferredFrame;
    writeStoredText(storageKeys.selected3dFrame, preferredFrame);
    onChange();
  };
  return {
    get selectedFrame() {
      return selectedFrame;
    },
    update() {
      const frames = transformTree.frames().sort();
      if (frames.length === 0) {
        return;
      }
      selectedFrame = chooseDisplayFrame(frames, preferredFrame);
      const frameList = JSON.stringify(frames);
      if (frameList !== previousFrames) {
        const options = frames.map((frame) => {
          const option = document.createElement("option");
          option.value = frame;
          option.textContent = frame;
          return option;
        });
        select.replaceChildren(...options);
        previousFrames = frameList;
      }
      select.value = selectedFrame;
      onChange();
    },
  };
}
