import { describe, expect, test } from "vitest";
import { createGoal, MissionClient } from "../src/control/missionClient.ts";

describe("mission requests", () => {
  test("UUID と waypoint の順序・半径", () => {
    const points = [{ x: 1, y: 2, arrival_radius_m: 0.5 }, { x: 3, y: 4, arrival_radius_m: 0 }];
    const first = createGoal(points); const second = createGoal(points);
    expect(first.goal_id.uuid).toHaveLength(16);
    expect(first.goal_id.uuid).not.toEqual(second.goal_id.uuid);
    expect(first.goal).toEqual({ waypoints: points, start_index: 0 });
  });
  test("空と不正な値は拒否する", () => {
    expect(() => createGoal([])).toThrow();
    expect(() => createGoal([{ x: 0, y: 0, arrival_radius_m: -1 }])).toThrow();
    expect(() => createGoal([{ x: Infinity, y: 0, arrival_radius_m: 0 }])).toThrow();
  });
  test("書き込み接続がなければ全操作を拒否する", async () => {
    const client = new MissionClient(null);
    const goal = createGoal([{ x: 1, y: 2, arrival_radius_m: 0 }]);
    await expect(client.sendGoal(goal)).rejects.toThrow();
    await expect(client.getResult(goal.goal_id)).rejects.toThrow();
    await expect(client.cancel()).rejects.toThrow();
    await expect(client.trigger("pause")).rejects.toThrow();
    await expect(client.trigger("resume")).rejects.toThrow();
  });
});
