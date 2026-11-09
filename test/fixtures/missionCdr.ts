// XCDR1 little endian。カプセル化ヘッダーの後を原点として整列する。
export const uuid = Array.from({ length: 16 }, (_, index) => index);
export const uuidDefinition = `unique_identifier_msgs/UUID goal_id
================================================================================
MSG: unique_identifier_msgs/UUID
uint8[16] uuid`;
export const resultRequest = new Uint8Array([0, 1, 0, 0, ...uuid]);
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
export const goalBytes = new Uint8Array([0,1,0,0, ...uuid, 1,0,0,0, 0,0,0,0, 0,0,0,0,0,0,0xf0,0x3f, 0,0,0,0,0,0,0,0x40, 0,0,0,0,0,0,0xe0,0x3f, 0,0,0,0]);
export const resultResponseSchema = `int8 status
lightnav_msgs/Result result
================================================================================
MSG: lightnav_msgs/Result
bool success
string message
uint32 reached_count`;
export const resultResponse = new Uint8Array([0,1,0,0, 6,0,0,0, 5,0,0,0, 102,97,105,108,0, 0,0,0, 2,0,0,0]);
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
export const cancelRequest = new Uint8Array([0,1,0,0, ...Array<number>(24).fill(0)]);
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
export const cancelResponse = new Uint8Array([0,1,0,0, 1,0,0,0, 0,0,0,0]);
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
export const feedbackBytes = new Uint8Array([0,1,0,0, ...uuid, 7,0,0,0, 80,65,85,83,69,68,0,0, 2,0,0,0, 0,0,0xc0,0x3f, 3,0,0,0, 4,5,1,0,1,255]);
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
export const statusBytes = new Uint8Array([0,1,0,0, 1,0,0,0, ...uuid, 1,0,0,0, 2,0,0,0, 2]);
