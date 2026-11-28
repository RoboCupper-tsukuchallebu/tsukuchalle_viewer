import { teleopSpeedPollIntervalMs, teleopSpeedReadTimeoutMs, teleopSpeedSetTimeoutMs } from "../../config.ts";
import type { FoxgloveClient } from "../../connection/foxgloveClient.ts";
import type { Parameter } from "../../connection/protocol.ts";
import {
  judgeChangeResponse,
  parseTeleopSpeedReading,
  speedAxes,
  teleopSpeedParameterNamesToRead,
  type SpeedAxis,
  type TeleopSpeedReading,
} from "../../control/teleopSpeed.ts";
import { teleopSpeedParameterNames } from "../../config.ts";

export type ApplyOutcome = { readonly messages: readonly string[]; readonly isError: boolean };

const timeoutErrorMessage = "timeout";
const disconnectedErrorMessage = "disconnected";

function withTimeout<Result>(pending: Promise<Result>, timeoutMs: number): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutErrorMessage));
    }, timeoutMs);
  });
  return Promise.race([pending, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

const axisLabels: Record<SpeedAxis, string> = { linear: "直進", angular: "旋回" };

/**
 * 手動走行の最大の速さの、読み直しと書き込み。画面（DOM）は知らない。
 * 書き込み用の接続を使う。接続が無い（閲覧先を変えている）ときは client が null。
 */
export class TeleopSpeedSession {
  reading: TeleopSpeedReading | undefined;
  lastReadAtMs: number | undefined;
  isWaitingForResponse = false;

  readonly #client: FoxgloveClient | null;
  readonly #onChange: () => void;
  #isReading = false;
  #pollTimer: ReturnType<typeof setInterval> | undefined;
  #isDisposed = false;
  readonly #unsubscribers: (() => void)[] = [];

  constructor(client: FoxgloveClient | null, onChange: () => void) {
    this.#client = client;
    this.#onChange = onChange;
  }

  get isConnected(): boolean {
    return this.#client?.state === "connected";
  }

  get isParametersAdvertised(): boolean {
    return this.#client?.hasCapability("parameters") ?? false;
  }

  start(): void {
    if (this.#client !== null) {
      this.#unsubscribers.push(this.#client.on("stateChanged", this.#handleStateChanged), this.#client.on("serverInfo", this.#handleServerInfo));
    }
    this.#pollTimer = setInterval(() => {
      void this.readNow();
      this.#onChange(); // 古さの表示を更新する
    }, teleopSpeedPollIntervalMs);
    void this.readNow();
  }

  dispose(): void {
    this.#isDisposed = true;
    clearInterval(this.#pollTimer);
    this.#unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.#unsubscribers.length = 0;
  }

  /** 前の読み直しの返事が来るまでは、次を送らない。 */
  async readNow(): Promise<void> {
    const client = this.#client;
    if (client === null || this.#isReading || !this.#isActive() || !this.isConnected || !this.isParametersAdvertised) {
      return;
    }
    this.#isReading = true;
    try {
      const parameters = await withTimeout(client.getParameters(teleopSpeedParameterNamesToRead()), teleopSpeedReadTimeoutMs);
      const reading = parseTeleopSpeedReading(parameters);
      if (this.#isActive()) {
        this.reading = reading ?? undefined;
        this.lastReadAtMs = reading === null ? undefined : Date.now();
      }
    } catch {
      // 読めなかった。lastReadAtMs はそのままにして、古くなるのを待つ。
    } finally {
      this.#isReading = false;
      if (this.#isActive()) {
        this.#onChange();
      }
    }
  }

  /** setParameters を 1 回だけ送り、結果を文にする。 */
  async apply(parameters: Parameter[], requested: Partial<Record<SpeedAxis, number>>): Promise<ApplyOutcome> {
    const client = this.#client;
    if (client === null || this.isWaitingForResponse) {
      return { messages: ["送れませんでした"], isError: true };
    }
    this.isWaitingForResponse = true;
    this.#onChange();
    try {
      const response = await withTimeout(client.setParameters(parameters), teleopSpeedSetTimeoutMs);
      return this.#interpretResponse(requested, response);
    } catch (error) {
      return this.#interpretFailure(error);
    } finally {
      this.isWaitingForResponse = false;
      if (this.#isActive()) {
        this.#onChange();
      }
    }
  }

  #interpretResponse(requested: Partial<Record<SpeedAxis, number>>, response: readonly Parameter[]): ApplyOutcome {
    const judgement = judgeChangeResponse(requested, response);
    this.#mergeReturnedValues(response);
    const messages: string[] = [];
    let isError = false;
    for (const axis of speedAxes) {
      if (judgement[axis] === "accepted") {
        messages.push(`${axisLabels[axis]}: 変えました`);
      } else if (judgement[axis] === "rejected") {
        isError = true;
        messages.push(`${axisLabels[axis]}: ロボットが受け付けませんでした`);
      }
    }
    return { messages, isError };
  }

  /** 返ってきた今の値を、読み戻した値として取り込む。 */
  #mergeReturnedValues(response: readonly Parameter[]): void {
    if (this.reading === undefined) {
      return;
    }
    const returnedValue = (name: string): number | undefined => {
      const value = response.find((parameter) => parameter.name === name)?.value;
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    };
    this.reading = {
      ...this.reading,
      current: {
        linear: returnedValue(teleopSpeedParameterNames.linear) ?? this.reading.current.linear,
        angular: returnedValue(teleopSpeedParameterNames.angular) ?? this.reading.current.angular,
      },
    };
    this.lastReadAtMs = Date.now();
  }

  #interpretFailure(error: unknown): ApplyOutcome {
    if (error instanceof Error && error.message === timeoutErrorMessage) {
      void this.readNow();
      return { messages: ["応答がありません"], isError: true };
    }
    if (error instanceof Error && error.message === disconnectedErrorMessage) {
      return { messages: ["接続が切れました。変わったかどうか分かりません"], isError: true };
    }
    return { messages: ["送れませんでした"], isError: true };
  }

  #isActive(): boolean {
    return !this.#isDisposed;
  }

  readonly #handleStateChanged = (): void => {
    this.#onChange();
    void this.readNow(); // つながり直したら、すぐ読み直す
  };

  readonly #handleServerInfo = (): void => {
    void this.readNow();
  };
}
