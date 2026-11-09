type Listener<Payload> = (payload: Payload) => void;

export class TypedEmitter<Events extends object> {
  readonly #listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** 購読を解除する関数を返す。 */
  on<Name extends keyof Events>(name: Name, listener: Listener<Events[Name]>): () => void {
    const listeners = this.#listeners.get(name) ?? new Set<Listener<never>>();
    listeners.add(listener);
    this.#listeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  protected emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    for (const listener of this.#listeners.get(name) ?? []) {
      (listener as Listener<Events[Name]>)(payload);
    }
  }
}
