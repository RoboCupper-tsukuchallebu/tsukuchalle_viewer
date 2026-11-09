import type { FoxgloveClient } from "../connection/foxgloveClient.ts";
import { createCdrDecoder, createCdrEncoder } from "../decoding/channelDecoder.ts";

const serviceTimeoutMs = 5000;
const goalIdBytes = 16;
export const actionRoot = "/lightnav/mission/follow_waypoints/_action";
export type Waypoint = { x: number; y: number; arrival_radius_m: number };

export function createGoal(waypoints: readonly Waypoint[]) {
  const invalid = waypoints.some((point) =>
    !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    !Number.isFinite(point.arrival_radius_m) || point.arrival_radius_m < 0,
  );
  if (waypoints.length === 0 || invalid) throw new Error("waypoint が不正です");
  const uuid = crypto.getRandomValues(new Uint8Array(goalIdBytes));
  return { goal_id: { uuid }, goal: { waypoints: waypoints.map((point) => ({ ...point })), start_index: 0 } };
}

export class MissionClient {
  private readonly client: FoxgloveClient | null;

  constructor(client: FoxgloveClient | null) {
    this.client = client;
  }

  async call(name: string, request: unknown, timeoutMs?: number): Promise<unknown> {
    const client = this.client;
    if (!client || client.state !== "connected") throw new Error("書き込み接続がありません");
    const service = [...client.services.values()].find((item) => item.name === name);
    if (!service?.request || !service.response || service.request.encoding !== "cdr" || service.response.encoding !== "cdr") {
      throw new Error(`サービスまたは型がありません: ${name}`);
    }
    const pending = client.callService(service.id, createCdrEncoder(service.request.schema)(request));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = timeoutMs === undefined ? await pending : await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error("応答がありません")); }, timeoutMs);
      })]);
      if (response.encoding !== "cdr") throw new Error("応答の encoding が不正です");
      return createCdrDecoder(service.response.schema)(response.payload);
    } finally {
      clearTimeout(timer);
    }
  }

  sendGoal(goal: ReturnType<typeof createGoal>) {
    return this.call(`${actionRoot}/send_goal`, goal, serviceTimeoutMs);
  }

  getResult(goalId: ReturnType<typeof createGoal>["goal_id"]) {
    return this.call(`${actionRoot}/get_result`, { goal_id: goalId });
  }

  cancel() {
    const goalInfo = { goal_id: { uuid: new Uint8Array(goalIdBytes) }, stamp: { sec: 0, nanosec: 0 } };
    return this.call(`${actionRoot}/cancel_goal`, { goal_info: goalInfo }, serviceTimeoutMs);
  }

  trigger(name: "pause" | "resume") {
    return this.call(`/lightnav/mission/${name}`, {}, serviceTimeoutMs);
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
