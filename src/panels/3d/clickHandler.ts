import { Raycaster, Vector2, type PerspectiveCamera } from "three";
import { groundClick } from "./groundClick.ts";
import type { TransformTree } from "./transformTree.ts";
import { notifyGroundClick } from "./viewApi.ts";

const clickTolerance = 5;

export function attachClickHandler(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  transformTree: TransformTree,
  selectedFrame: () => string,
  report: (key: string, reason: string) => void,
): () => void {
  let pointer: { x: number; y: number } | undefined;
  const pointerDown = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event: PointerEvent) => {
    if (!pointer || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > clickTolerance) {
      pointer = undefined;
      return;
    }
    pointer = undefined;
    const canvasRectangle = canvas.getBoundingClientRect();
    const position = new Vector2(
      ((event.clientX - canvasRectangle.left) / canvasRectangle.width) * 2 - 1,
      (-(event.clientY - canvasRectangle.top) / canvasRectangle.height) * 2 + 1,
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(position, camera);
    const result = groundClick(raycaster.ray, selectedFrame(), transformTree, Date.now());
    report("click", result.isPlaceable ? "" : result.reason);
    notifyGroundClick(result);
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  return () => {
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointerup", pointerUp);
  };
}
