// localStorage は読めない・書けないことがある（プライベートウィンドウなど）。失敗しても画面は動く。
export function readStoredText(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 覚えられないだけ。
  }
}
