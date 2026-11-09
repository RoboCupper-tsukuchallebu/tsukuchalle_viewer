export const initialReconnectDelayMs = 1000;
export const maximumReconnectDelayMs = 10_000;

/** 1 秒、2 秒、4 秒、8 秒、10 秒、10 秒…。attempt は 0 から数える。 */
export function reconnectDelayMs(
  attempt: number,
  initialDelayMs: number = initialReconnectDelayMs,
  maximumDelayMs: number = maximumReconnectDelayMs,
): number {
  return Math.min(initialDelayMs * 2 ** attempt, maximumDelayMs);
}
