import { expect, test } from "vitest";
import { createCdrDecoder, createCdrEncoder } from "../src/decoding/channelDecoder.ts";
import { cancelRequest, cancelSchema, goalBytes, goalSchema, resultRequest, resultResponse, resultResponseSchema, uuid, uuidDefinition } from "./fixtures/missionCdr.ts";

test("ROS で生成した要求と応答の CDR", () => {
  expect(createCdrEncoder(uuidDefinition)({ goal_id: { uuid } })).toEqual(resultRequest);
  const goal = { goal_id: { uuid }, goal: { waypoints: [{ x: 1, y: 2, arrival_radius_m: 0.5 }], start_index: 0 } };
  const encodedGoal = createCdrEncoder(goalSchema)(goal);
  // CDR のパディングは未定義で、ROS はゼロ以外の値を出す場合がある。
  expect([...encodedGoal.slice(0, 24), ...encodedGoal.slice(28)]).toEqual([...goalBytes.slice(0, 24), ...goalBytes.slice(28)]);
  expect(createCdrDecoder(goalSchema)(goalBytes)).toMatchObject({ ...goal, goal_id: { uuid: new Uint8Array(uuid) } });
  expect(createCdrEncoder(cancelSchema)({ goal_info: { goal_id: { uuid: new Uint8Array(16) }, stamp: { sec: 0, nanosec: 0 } } })).toEqual(cancelRequest);
  expect(createCdrDecoder(resultResponseSchema)(resultResponse)).toEqual({ status: 6, result: { success: false, message: "fail", reached_count: 2 } });
});

test("ROS で生成した停止、feedback、status の CDR", async () => {
  const fixtures = await import("./fixtures/missionCdr.ts");
  expect(createCdrDecoder(fixtures.cancelResponseSchema)(fixtures.cancelResponse)).toEqual({ return_code: 1, goals_canceling: [] });
  expect(createCdrDecoder(fixtures.feedbackSchema)(fixtures.feedbackBytes)).toMatchObject({ feedback: { state: "PAUSED", current_waypoint_index: 2, distance_to_waypoint_m: 1.5, path_id: 3, follow_state: 4, active_layer: 5, is_blocked: true, is_stuck: false, is_not_moving: true, localization_state: 255 } });
  expect(createCdrDecoder(fixtures.statusSchema)(fixtures.statusBytes)).toMatchObject({ status_list: [{ goal_info: { stamp: { sec: 1, nanosec: 2 } }, status: 2 }] });
});
