import { expect, it, vi } from 'vitest';
import { Group, Object3D } from 'three';
import { addOverlay, attachOverlays, notifyGroundClick, onGroundClick, onGroundClickRejected } from '../../src/panels/3d/viewApi.ts';
import { writeHeightColor } from '../../src/panels/3d/colors.ts';

it('パネルを開き直してもオーバーレイを付け直し解除できる', () => {
  const object = new Object3D(); const remove = addOverlay(object); const first = new Group();
  const detach = attachOverlays(first); expect(object.parent).toBe(first); detach();
  const second = new Group(); const detachSecond = attachOverlays(second); expect(object.parent).toBe(second);
  remove(); expect(object.parent).toBeNull(); detachSecond();
});
it('クリックの成功と失敗を別々に通知する', () => {
  const accepted = vi.fn(); const rejected = vi.fn();
  const stopAccepted = onGroundClick(accepted); const stopRejected = onGroundClickRejected(rejected);
  notifyGroundClick({ isPlaceable: true, x: 2, y: 3 }); notifyGroundClick({ isPlaceable: false, reason: 'TF がありません' });
  expect(accepted).toHaveBeenCalledWith({ x: 2, y: 3 }); expect(rejected).toHaveBeenCalledWith('TF がありません');
  stopAccepted(); stopRejected();
});
it('高さの範囲を色に変換する', () => {
  const colors = new Float32Array(9);
  writeHeightColor(colors, 0, 0, 0, 10);
  writeHeightColor(colors, 3, 10, 0, 10);
  writeHeightColor(colors, 6, 5, 0, 10);
  expect([...colors]).toEqual([0, 0, 1, 1, 0, 0, 0.5, 1, 0.5]);
});
