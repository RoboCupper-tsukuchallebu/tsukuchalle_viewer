import type { TopicStore } from "./topicStore.ts";

export type DiagnosticLevel = 0 | 1 | 2 | 3;

export type DiagnosticStatus = {
  level: DiagnosticLevel;
  name: string;
  message: string;
  hardwareId: string;
  values: Record<string, string>;
  receivedAtMs: number;
};

type DecodedKeyValue = { key?: unknown; value?: unknown };
type DecodedStatus = {
  level?: unknown;
  name?: unknown;
  message?: unknown;
  hardware_id?: unknown;
  values?: unknown;
};

/** /diagnostics の status を name ごとの最新だけ持つ（状態と衛星のパネルが読む）。 */
export class DiagnosticsStore {
  readonly #byName = new Map<string, DiagnosticStatus>();
  readonly #listeners = new Set<() => void>();

  get(name: string): DiagnosticStatus | undefined {
    return this.#byName.get(name);
  }

  all(): DiagnosticStatus[] {
    return [...this.#byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** DiagnosticArray をデコードした値を受け取る。形が合わない status は飛ばす。 */
  update(diagnosticArray: unknown, receivedAtMs: number): void {
    const statuses = (diagnosticArray as { status?: unknown } | null)?.status;
    if (!Array.isArray(statuses)) {
      return;
    }
    for (const rawStatus of statuses as DecodedStatus[]) {
      if (typeof rawStatus.name !== "string") {
        continue;
      }
      this.#byName.set(rawStatus.name, {
        level: toLevel(rawStatus.level),
        name: rawStatus.name,
        message: typeof rawStatus.message === "string" ? rawStatus.message : "",
        hardwareId: typeof rawStatus.hardware_id === "string" ? rawStatus.hardware_id : "",
        values: toValues(rawStatus.values),
        receivedAtMs,
      });
    }
    this.#listeners.forEach((listener) => {
      listener();
    });
  }

  /** 解除する関数を返す。 */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** topicStore の指定トピックに届くたびに更新する。解除する関数を返す。 */
  attach(topicStore: TopicStore, topic: string): () => void {
    return topicStore.subscribe(topic, (entry) => {
      this.update(entry.value, entry.receivedAtMs);
    });
  }
}

function toLevel(value: unknown): DiagnosticLevel {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function toValues(rawValues: unknown): Record<string, string> {
  const values: Record<string, string> = {};
  if (Array.isArray(rawValues)) {
    for (const item of rawValues as DecodedKeyValue[]) {
      if (typeof item.key === "string" && typeof item.value === "string") {
        values[item.key] = item.value;
      }
    }
  }
  return values;
}
