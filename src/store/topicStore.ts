/** トピックごとの最新値と、ブラウザで受け取った時刻。古さは ROS の stamp ではなくこの時刻で測る（時計のずれに左右されないため）。 */
export type TopicEntry = {
  topic: string;
  value: unknown;
  receivedAtMs: number;
  logTimeNanoseconds: bigint;
};

type TopicListener = (entry: TopicEntry) => void;

export class TopicStore {
  readonly #entries = new Map<string, TopicEntry>();
  readonly #listeners = new Map<string, Set<TopicListener>>();
  readonly #decodeErrors = new Map<string, string>();
  readonly #now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  get(topic: string): TopicEntry | undefined {
    return this.#entries.get(topic);
  }

  /** 受け取ってからの経過ミリ秒。まだ受け取っていなければ undefined。 */
  ageMs(topic: string): number | undefined {
    const entry = this.#entries.get(topic);
    return entry === undefined ? undefined : this.#now() - entry.receivedAtMs;
  }

  topics(): string[] {
    return [...this.#entries.keys()];
  }

  decodeError(topic: string): string | undefined {
    return this.#decodeErrors.get(topic);
  }

  put(topic: string, value: unknown, logTimeNanoseconds: bigint): void {
    this.#decodeErrors.delete(topic);
    const entry: TopicEntry = { topic, value, receivedAtMs: this.#now(), logTimeNanoseconds };
    this.#entries.set(topic, entry);
    this.#listeners.get(topic)?.forEach((listener) => {
      listener(entry);
    });
  }

  recordDecodeError(topic: string, message: string): void {
    this.#decodeErrors.set(topic, message);
  }

  /** 購読を解除する関数を返す。 */
  subscribe(topic: string, listener: TopicListener): () => void {
    const listeners = this.#listeners.get(topic) ?? new Set<TopicListener>();
    listeners.add(listener);
    this.#listeners.set(topic, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  /** 全部消す。接続が切れても自動では呼ばない（値は残し、古さ ageMs で判断させる）。 */
  clear(): void {
    this.#entries.clear();
    this.#decodeErrors.clear();
  }
}
