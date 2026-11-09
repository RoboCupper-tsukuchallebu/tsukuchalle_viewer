#!/usr/bin/env python3
"""Generate mission CDR fixture bytes with ROS 2 Jazzy rclpy."""
import json

from action_msgs.msg import GoalInfo, GoalStatus, GoalStatusArray
from action_msgs.srv import CancelGoal
from builtin_interfaces.msg import Time
from lightnav_msgs.action import FollowWaypoints
from lightnav_msgs.msg import Waypoint
from rclpy.serialization import serialize_message
from unique_identifier_msgs.msg import UUID

uuid = UUID(uuid=list(range(16)))
goal_info = GoalInfo(goal_id=uuid, stamp=Time(sec=1, nanosec=2))
messages = {
    "resultRequest": FollowWaypoints.Impl.GetResultService.Request(goal_id=uuid),
    "goalBytes": FollowWaypoints.Impl.SendGoalService.Request(
        goal_id=uuid,
        goal=FollowWaypoints.Goal(waypoints=[Waypoint(x=1.0, y=2.0, arrival_radius_m=0.5)], start_index=0),
    ),
    "resultResponse": FollowWaypoints.Impl.GetResultService.Response(
        status=6, result=FollowWaypoints.Result(success=False, message="fail", reached_count=2),
    ),
    "cancelRequest": CancelGoal.Request(goal_info=GoalInfo()),
    "cancelResponse": CancelGoal.Response(return_code=1, goals_canceling=[]),
    "feedbackBytes": FollowWaypoints.Impl.FeedbackMessage(
        goal_id=uuid,
        feedback=FollowWaypoints.Feedback(
            state="PAUSED", current_waypoint_index=2, distance_to_waypoint_m=1.5,
            path_id=3, follow_state=4, active_layer=5, is_blocked=True,
            is_stuck=False, is_not_moving=True, localization_state=255,
        ),
    ),
    "statusBytes": GoalStatusArray(status_list=[GoalStatus(goal_info=goal_info, status=2)]),
}
print(json.dumps({name: list(serialize_message(message)) for name, message in messages.items()}, indent=2))
