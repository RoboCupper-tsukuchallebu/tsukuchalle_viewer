import { expect, test } from "vitest";
import { createCdrDecoder, createCdrEncoder } from "../src/decoding/channelDecoder.ts";
import { cancelRequest, cancelSchema, goalBytes, goalSchema, resultRequest, resultResponse, resultResponseSchema, uuid, uuidDefinition } from "./fixtures/missionCdr.ts";

test("hand-calculated CDR request and response bytes", () => {
  expect(createCdrEncoder(uuidDefinition)({ goal_id: { uuid } })).toEqual(resultRequest);
  expect(createCdrEncoder(goalSchema)({ goal_id: { uuid }, goal: { waypoints: [{ x: 1, y: 2, arrival_radius_m: 0.5 }], start_index: 0 } })).toEqual(goalBytes);
  expect(createCdrEncoder(cancelSchema)({ goal_info: { goal_id: { uuid: new Uint8Array(16) }, stamp: { sec: 0, nanosec: 0 } } })).toEqual(cancelRequest);
  expect(createCdrDecoder(resultResponseSchema)(resultResponse)).toEqual({ status: 6, result: { success: false, message: "fail", reached_count: 2 } });
});

test("hand-calculated cancel, feedback and status bytes", async () => {
  const fixtures = await import("./fixtures/missionCdr.ts");
  expect(createCdrDecoder(fixtures.cancelResponseSchema)(fixtures.cancelResponse)).toEqual({ return_code: 1, goals_canceling: [] });
  expect(createCdrDecoder(fixtures.feedbackSchema)(fixtures.feedbackBytes)).toMatchObject({ feedback: { state: "PAUSED", current_waypoint_index: 2, distance_to_waypoint_m: 1.5, path_id: 3, follow_state: 4, active_layer: 5, is_blocked: true, is_stuck: false, is_not_moving: true, localization_state: 255 } });
  expect(createCdrDecoder(fixtures.statusSchema)(fixtures.statusBytes)).toMatchObject({ status_list: [{ goal_info: { stamp: { sec: 1, nanosec: 2 } }, status: 2 }] });
});
