import { teleopSpeedParameterNames, teleopSpeedPollIntervalMs, teleopSpeedReadTimeoutMs, teleopSpeedSetTimeoutMs } from "../../config.ts";
import { ParameterRequestTimeoutError, type FoxgloveClient } from "../../connection/foxgloveClient.ts";
import type { Parameter } from "../../connection/protocol.ts";
import {
  formatSpeed,
  judgeChangeResponse,
  parseTeleopSpeedReading,
  speedAxes,
  teleopSpeedParameterNamesToRead,
  type SpeedAxis,
  type TeleopSpeedReading,
} from "../../control/teleopSpeed.ts";

export type ApplyOutcome = {
  readonly messages: readonly string[];
  readonly isError: boolean;
  /** ロボットが受け付けた軸。選んだ値を捨ててよいのは、この軸だけ。 */
  readonly acceptedAxes: readonly SpeedAxis[];
};

const axisLabels: Record<SpeedAxis, string> = { linear: "直進", angular: "旋回" };
const parameterNameByAxis: Record<SpeedAxis, string> = {
  linear: teleopSpeedParameterNames.linear,
  angular: teleopSpeedParameterNames.angular,
};

function numberValueOf(parameters: readonly Parameter[], name: string): number | undefined {
  const value = parameters.find((parameter) => parameter.name === name)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

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
  readonly #unsubscribers: (() => void)[] = [];
  #isReading = false;
  /** 適用の開始と終了で増える。この間に始まった読み直しの結果は捨てる（古い値で上書きしない）。 */
  #writeGeneration = 0;
  #pollTimer: ReturnType<typeof setInterval> | undefined;
  #isDisposed = false;

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

  /** 前の読み直しの返事が来るまでと、適用の返事を待っている間は、送らない。 */
  async readNow(): Promise<void> {
    const client = this.#client;
    if (client === null || this.#isReading || this.isWaitingForResponse || !this.#isActive() || !this.isConnected || !this.isParametersAdvertised) {
      return;
    }
    this.#isReading = true;
    const generationAtStart = this.#writeGeneration;
    try {
      const parameters = await client.getParameters(teleopSpeedParameterNamesToRead(), teleopSpeedReadTimeoutMs);
      if (this.#isActive() && generationAtStart === this.#writeGeneration) {
        const reading = parseTeleopSpeedReading(parameters);
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
      return { messages: ["送れませんでした"], isError: true, acceptedAxes: [] };
    }
    this.isWaitingForResponse = true;
    this.#writeGeneration += 1;
    this.#onChange();
    try {
      const response = await client.setParameters(parameters, teleopSpeedSetTimeoutMs);
      return this.#interpretResponse(requested, response);
    } catch (error) {
      return this.#interpretFailure(error);
    } finally {
      this.isWaitingForResponse = false;
      this.#writeGeneration += 1;
      if (this.#isActive()) {
        this.#onChange();
      }
    }
  }

  #interpretResponse(requested: Partial<Record<SpeedAxis, number>>, response: readonly Parameter[]): ApplyOutcome {
    const judgement = judgeChangeResponse(requested, response);
    this.#mergeReturnedValues(requested, response);
    const messages: string[] = [];
    const acceptedAxes: SpeedAxis[] = [];
    for (const axis of speedAxes) {
      if (judgement[axis] === "accepted") {
        acceptedAxes.push(axis);
        messages.push(`${axisLabels[axis]}: 変えました`);
      } else if (judgement[axis] === "rejected") {
        const currentValue = this.reading?.current[axis];
        const currentText = currentValue === undefined ? "" : `（今の値: ${formatSpeed(axis, currentValue)}）`;
        messages.push(`${axisLabels[axis]}: ロボットが受け付けませんでした${currentText}`);
      }
    }
    return { messages, isError: acceptedAxes.length < Object.keys(requested).length, acceptedAxes };
  }

  /**
   * 返ってきた今の値を取り込む。「最後に読めた時刻」を更新するのは、頼んだ名前の値がすべて返ってきたときだけ。
   * 空の返事（ノードが応答せず、ブリッジが空の一覧を返すとき）で、知らない値を新しいと見せない。
   * 値がそろわなかったときは、すぐ読み直す。
   */
  #mergeReturnedValues(requested: Partial<Record<SpeedAxis, number>>, response: readonly Parameter[]): void {
    const requestedAxes = speedAxes.filter((axis) => requested[axis] !== undefined);
    const returnedAxes = requestedAxes.filter((axis) => numberValueOf(response, parameterNameByAxis[axis]) !== undefined);
    if (this.reading !== undefined) {
      this.reading = {
        ...this.reading,
        current: {
          linear: numberValueOf(response, teleopSpeedParameterNames.linear) ?? this.reading.current.linear,
          angular: numberValueOf(response, teleopSpeedParameterNames.angular) ?? this.reading.current.angular,
        },
      };
    }
    if (returnedAxes.length === requestedAxes.length) {
      this.lastReadAtMs = Date.now();
    } else {
      queueMicrotask(() => {
        void this.readNow();
      });
    }
  }

  #interpretFailure(error: unknown): ApplyOutcome {
    if (error instanceof ParameterRequestTimeoutError) {
      queueMicrotask(() => {
        void this.readNow();
      });
      return { messages: ["応答がありません"], isError: true, acceptedAxes: [] };
    }
    if (error instanceof Error && error.message === "disconnected") {
      return { messages: ["接続が切れました。変わったかどうか分かりません"], isError: true, acceptedAxes: [] };
    }
    return { messages: ["送れませんでした"], isError: true, acceptedAxes: [] };
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
