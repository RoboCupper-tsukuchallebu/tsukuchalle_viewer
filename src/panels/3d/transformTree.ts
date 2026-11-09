import { Quaternion, Vector3 } from "three";

export type Vector = { x: number; y: number; z: number };
export type TransformMessage = { transforms: { header: { frame_id: string }; child_frame_id: string; transform: { translation: Vector; rotation: { x: number; y: number; z: number; w: number } } }[] };
type Edge = { parent: string; child: string; translation: Vector3; rotation: Quaternion; isStatic: boolean; receivedAtMs: number };
export type TransformLookup = { translation: Vector3; rotation: Quaternion; dynamicReceivedAtMs: number[] };

/** 子フレームごとに最新の変換を保持する。 */
export class TransformTree {
  readonly #edges = new Map<string, Edge>();

  update(message: TransformMessage, isStatic: boolean, receivedAtMs: number): void {
    for (const item of message.transforms) {
      const { translation, rotation } = item.transform;
      this.#edges.set(item.child_frame_id, { parent: item.header.frame_id, child: item.child_frame_id, translation: new Vector3(translation.x, translation.y, translation.z), rotation: new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize(), isStatic, receivedAtMs });
    }
  }

  frames(): string[] {
    return [...new Set([...this.#edges.values()].flatMap((edge) => [edge.parent, edge.child]))];
  }

  /** source の座標を target へ変換する。循環があっても各フレームは一度だけ訪れる。 */
  lookup(source: string, target: string): TransformLookup | undefined {
    const initial: TransformLookup = { translation: new Vector3(), rotation: new Quaternion(), dynamicReceivedAtMs: [] };
    const queue = [{ frame: source, result: initial }];
    const visited = new Set([source]);
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      if (current.frame === target) return current.result;
      for (const edge of this.#edges.values()) {
        const forward = edge.child === current.frame;
        const next = forward ? edge.parent : edge.parent === current.frame ? edge.child : undefined;
        if (!next || visited.has(next)) continue;
        const rotation = forward ? edge.rotation.clone() : edge.rotation.clone().invert();
        const translation = forward ? edge.translation.clone() : edge.translation.clone().negate().applyQuaternion(rotation);
        const result = { rotation: rotation.clone().multiply(current.result.rotation), translation: current.result.translation.clone().applyQuaternion(rotation).add(translation), dynamicReceivedAtMs: edge.isStatic ? current.result.dynamicReceivedAtMs : [...current.result.dynamicReceivedAtMs, edge.receivedAtMs] };
        visited.add(next);
        queue.push({ frame: next, result });
      }
    }
    return undefined;
  }
}
