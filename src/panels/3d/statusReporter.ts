/** 複数の理由を独立して更新し、同じ領域に表示する。 */
export function createStatusReporter(element: HTMLElement): (key: string, reason: string) => void {
  const reasons = new Map<string, string>();
  return (key, reason) => {
    if (reason) {
      reasons.set(key, reason);
    } else {
      reasons.delete(key);
    }
    element.textContent = [...reasons.values()].join(" / ");
  };
}
