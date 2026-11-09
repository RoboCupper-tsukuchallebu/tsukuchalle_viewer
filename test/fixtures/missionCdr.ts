import fixtureBytes from "./missionCdr.json";
export const uuid = Array.from({ length: 16 }, (_, index) => index);
export const uuidDefinition = `unique_identifier_msgs/UUID goal_id
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid`;
export const resultRequest = new Uint8Array(fixtureBytes.resultRequest);
export const goalSchema = `unique_identifier_msgs/UUID goal_id
lightnav_msgs/Goal goal
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid
================================================================================
MSG: lightnav_msgs/Goal
lightnav_msgs/Waypoint[] waypoints
uint32 start_index
================================================================================
MSG: lightnav_msgs/Waypoint
float64 x
float64 y
float64 arrival_radius_m`;
export const goalBytes = new Uint8Array(fixtureBytes.goalBytes);
export const resultResponseSchema = `int8 status
lightnav_msgs/Result result
================================================================================
MSG: lightnav_msgs/Result
bool success
string message
uint32 reached_count`;
export const resultResponse = new Uint8Array(fixtureBytes.resultResponse);
export const cancelSchema = `action_msgs/GoalInfo goal_info
================================================================================
MSG: action_msgs/GoalInfo
unique_identifier_msgs/UUID goal_id
builtin_interfaces/Time stamp
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;
export const cancelRequest = new Uint8Array(fixtureBytes.cancelRequest);
export const cancelResponseSchema = `int8 return_code
action_msgs/GoalInfo[] goals_canceling
================================================================================
MSG: action_msgs/GoalInfo
unique_identifier_msgs/UUID goal_id
builtin_interfaces/Time stamp
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;
export const cancelResponse = new Uint8Array(fixtureBytes.cancelResponse);
export const feedbackSchema = `unique_identifier_msgs/UUID goal_id
lightnav_msgs/Feedback feedback
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid
================================================================================
MSG: lightnav_msgs/Feedback
string state
uint32 current_waypoint_index
float32 distance_to_waypoint_m
uint32 path_id
uint8 follow_state
uint8 active_layer
bool is_blocked
bool is_stuck
bool is_not_moving
uint8 localization_state`;
export const feedbackBytes = new Uint8Array(fixtureBytes.feedbackBytes);
export const statusSchema = `action_msgs/GoalStatus[] status_list
================================================================================
MSG: action_msgs/GoalStatus
action_msgs/GoalInfo goal_info
int8 status
================================================================================
MSG: action_msgs/GoalInfo
unique_identifier_msgs/UUID goal_id
builtin_interfaces/Time stamp
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;
export const statusBytes = new Uint8Array(fixtureBytes.statusBytes);
