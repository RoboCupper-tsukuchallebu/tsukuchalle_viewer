# 合成した値の PointCloud2・TFMessage・Odometry・Path を rclpy で CDR にして、bridge と同じ形の ros2msg スキーマと一緒に JSON で出す。
import json, re, struct, sys
from pathlib import Path
import math
from ament_index_python.packages import get_package_share_directory
from rclpy.serialization import serialize_message
from sensor_msgs.msg import PointCloud2, PointField
from tf2_msgs.msg import TFMessage
from geometry_msgs.msg import TransformStamped, PoseStamped
from nav_msgs.msg import Odometry, Path as PathMsg

def msg_text(package, name):
    base = Path("/ws/install/share") / package if package == "lightnav_msgs" else Path(get_package_share_directory(package))
    return (base / "msg" / f"{name}.msg").read_text()

def deps(package, name, seen, order):
    text = msg_text(package, name)
    for line in text.splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        type_name = line.split()[0].split("[")[0]
        if "/" in type_name:
            pkg, typ = type_name.split("/")[0], type_name.split("/")[-1]
        elif type_name in ("Header",):
            pkg, typ = "std_msgs", "Header"
        elif type_name in ("bool","byte","char","float32","float64","int8","uint8","int16","uint16","int32","uint32","int64","uint64","string","wstring","time","duration"):
            continue
        else:
            pkg, typ = package, type_name
        key = f"{pkg}/{typ}"
        if key not in seen:
            seen.add(key)
            deps(pkg, typ, seen, order)
            order.append(key)

def schema(full):
    package, name = full.split("/")
    seen, order = {full}, []
    deps(package, name, seen, order)
    out = msg_text(package, name)
    for key in order:
        pkg, typ = key.split("/")
        out += "\n" + "=" * 80 + f"\nMSG: {pkg}/{typ}\n" + msg_text(pkg, typ)
    return out

def hexof(msg): return serialize_message(msg).hex()

def stamp(msg_stamp, sec, nanosec):
    msg_stamp.sec = sec; msg_stamp.nanosec = nanosec

def cloud(frame, fields, point_step, width, height, rows, big=False):
    m = PointCloud2()
    m.header.frame_id = frame; stamp(m.header.stamp, 100, 5)
    m.height, m.width = height, width
    m.fields = [PointField(name=n, offset=o, datatype=d, count=1) for n, o, d in fields]
    m.is_bigendian = big
    m.point_step = point_step; m.row_step = point_step * width
    m.is_dense = False
    m.data = b"".join(rows)
    return m

F32, U16 = 7, 4
nan = float("nan")
fixtures = {}
# aligned_scan 型: x y z だけ 12 バイト/点。3 点目は NaN、4 点目は無限大。
rows = [struct.pack("<fff", *p) for p in [(1.0, 2.0, 3.0), (-1.5, 0.25, 0.5), (nan, nan, nan), (math.inf, 0.0, 0.0), (4.0, 5.0, 6.0)]]
fixtures["pointCloudXyz"] = {"type": "sensor_msgs/PointCloud2", "hex": hexof(cloud("map", [("x",0,F32),("y",4,F32),("z",8,F32)], 12, 5, 1, rows))}
# velodyne 型: organized 2x3、x y z intensity ring time、32 バイト/点で offset が詰まっていない。NaN の点を含む。
def vel(x,y,z,i,r,t): return struct.pack("<fffxxxxfHxxfxxxx", x,y,z,i,r,t)[:32].ljust(32, b"\0")
vrows = [vel(1,2,3,10,1,0.0), vel(nan,nan,nan,0,2,0.1), vel(-2,0.5,1.5,20,3,0.2), vel(0.5,-0.5,-0.25,30,4,0.3), vel(nan,nan,nan,0,5,0.4), vel(7,8,9,40,6,0.5)]
fixtures["pointCloudVelodyneLike"] = {"type": "sensor_msgs/PointCloud2", "hex": hexof(cloud("velodyne", [("x",0,F32),("y",4,F32),("z",8,F32),("intensity",16,F32),("ring",20,U16),("time",24,F32)], 32, 3, 2, vrows))}
# 並びが x y z ではない（z が先頭）
zrows = [struct.pack("<fff", z, x, y) for x,y,z in [(1,2,3),(4,5,6)]]
fixtures["pointCloudReorderedFields"] = {"type": "sensor_msgs/PointCloud2", "hex": hexof(cloud("map", [("z",0,F32),("x",4,F32),("y",8,F32)], 12, 2, 1, zrows))}
fixtures["pointCloudBigEndian"] = {"type": "sensor_msgs/PointCloud2", "hex": hexof(cloud("map", [("x",0,F32),("y",4,F32),("z",8,F32)], 12, 1, 1, [struct.pack(">fff", 1,2,3)], big=True))}

def tf(parent, child, xyz, yaw, sec=100):
    t = TransformStamped(); t.header.frame_id = parent; t.child_frame_id = child
    stamp(t.header.stamp, sec, 0)
    t.transform.translation.x, t.transform.translation.y, t.transform.translation.z = xyz
    t.transform.rotation.z = math.sin(yaw/2); t.transform.rotation.w = math.cos(yaw/2)
    return t
m = TFMessage(); m.transforms = [tf("map","odom",(10.0,-2.0,0.5),math.pi/2), tf("odom","base_link",(1.0,2.0,0.25),0.0)]
fixtures["tfMessage"] = {"type": "tf2_msgs/TFMessage", "hex": hexof(m)}

o = Odometry(); o.header.frame_id = "odom"; o.child_frame_id = "base_link"; stamp(o.header.stamp, 100, 0)
o.pose.pose.position.x, o.pose.pose.position.y, o.pose.pose.position.z = 1.0, 2.0, 0.25
o.pose.pose.orientation.z = math.sin(math.pi/8); o.pose.pose.orientation.w = math.cos(math.pi/8)
fixtures["odometry"] = {"type": "nav_msgs/Odometry", "hex": hexof(o)}

p = PathMsg(); p.header.frame_id = "map"; stamp(p.header.stamp, 100, 0)
for x, y in [(0.0,0.0),(1.0,0.5),(2.0,1.5)]:
    ps = PoseStamped(); ps.header.frame_id = "map"; ps.pose.position.x = x; ps.pose.position.y = y; ps.pose.position.z = 0.1; ps.pose.orientation.w = 1.0
    p.poses.append(ps)
fixtures["path"] = {"type": "nav_msgs/Path", "hex": hexof(p)}

from lightnav_msgs.msg import PathWithId
w = PathWithId(); w.header.frame_id = "map"; stamp(w.header.stamp, 100, 0); w.session_id = 7; w.path_id = 3
w.path = p; w.waypoint_indices = [0, 2]
fixtures["pathWithId"] = {"type": "lightnav_msgs/PathWithId", "hex": hexof(w)}

for key, value in fixtures.items():
    value["schema"] = schema(value["type"])
json.dump(fixtures, sys.stdout, indent=1)
