#!/usr/bin/env python3
"""Generate a MarkerArray CDR fixture using ROS 2 Jazzy rclpy."""
import json
from geometry_msgs.msg import Point
from rclpy.serialization import serialize_message
from visualization_msgs.msg import Marker, MarkerArray

marker = Marker()
marker.header.frame_id = "map"
marker.ns = "candidates"
marker.id = 7
marker.type = Marker.LINE_STRIP
marker.action = Marker.ADD
marker.pose.orientation.w = 1.0
marker.scale.x = 0.1
marker.color.r = 1.0
marker.color.a = 1.0
marker.points = [Point(x=1.0, y=2.0, z=0.0), Point(x=3.0, y=4.0, z=0.0)]
print(json.dumps(list(serialize_message(MarkerArray(markers=[marker])))))
