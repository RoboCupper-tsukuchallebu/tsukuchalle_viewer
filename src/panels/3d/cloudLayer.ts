import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from "three";
import type { ExtractedPointCloud } from "../../decoding/pointCloud.ts";

export class CloudLayer {
  readonly object: Points<BufferGeometry, PointsMaterial>;
  private geometry: BufferGeometry;
  private capacity: number;
  frame = "";
  constructor(capacity: number) {
    this.capacity = capacity;
    this.geometry = this.createGeometry(capacity);
    this.object = new Points(this.geometry, new PointsMaterial({ size: 0.08, vertexColors: true }));
    // 点群は表示フレームの変換で動くため、カリングを使わない。
    this.object.frustumCulled = false;
  }
  private createGeometry(capacity: number): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(capacity * 3), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(capacity * 3), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }
  update(result: ExtractedPointCloud, frame: string): void {
    if (result.count > this.capacity) {
      this.capacity = result.count;
      this.geometry.dispose();
      this.geometry = this.createGeometry(this.capacity);
      this.object.geometry = this.geometry;
    }
    // 大きな点群の割り当てを毎フレーム繰り返さないため、属性配列を再利用する。
    const position = this.geometry.getAttribute("position");
    const color = this.geometry.getAttribute("color");
    if (
      !(position instanceof BufferAttribute) ||
      !(color instanceof BufferAttribute) ||
      !(position.array instanceof Float32Array) ||
      !(color.array instanceof Float32Array)
    ) {
      throw new Error("点群のバッファ形式が不正です");
    }
    position.array.set(result.points);
    color.array.set(result.colors);
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.geometry.setDrawRange(0, result.count);
    this.frame = frame;
  }
  dispose(): void {
    this.geometry.dispose();
    this.object.material.dispose();
  }
}
