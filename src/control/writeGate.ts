/**
 * 書き込みのスイッチ。既定は無効で、ページを開き直すと無効に戻る（localStorage に覚えない）。
 * 画面（上部バー）に出すのは PR 1。有効にできるようにするのは PR 7。
 * 停止・一時停止はこのスイッチに関係なく押せる（仕様 6 章の 3）ので、ここを通さない。
 */
export class WriteGate {
  #isEnabled = false;
  readonly #listeners = new Set<(isEnabled: boolean) => void>();

  get isEnabled(): boolean {
    return this.#isEnabled;
  }

  enable(): void {
    this.#set(true);
  }

  disable(): void {
    this.#set(false);
  }

  /** 解除する関数を返す。 */
  subscribe(listener: (isEnabled: boolean) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #set(isEnabled: boolean): void {
    if (this.#isEnabled !== isEnabled) {
      this.#isEnabled = isEnabled;
      this.#listeners.forEach((listener) => {
        listener(isEnabled);
      });
    }
  }
}
