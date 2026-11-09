"""Fixed Docker Compose operations, reachable only from the local nginx proxy."""
import json
import logging
import os
import subprocess
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

IDS = {"drive", "teleop", "joy", "mux", "nav", "localization_mapping", "localization_localization", "bag_record"}
TOPICS = ["/tf", "/tf_static", "/odom", "/cmd_vel", "/velodyne_points", "/lightnav/localization/map_cloud", "/lightnav/localization/path"]
LOCK = threading.Lock()


def load_config(path):
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or set(data) != IDS:
        raise ValueError("invalid service ids")
    expected = {
        "drive": ("DRIVERS_DIR", "drive"), "teleop": ("DRIVERS_DIR", "teleop"),
        "joy": ("DRIVERS_DIR", "joy"), "mux": ("DRIVERS_DIR", "mux"),
        "nav": ("LIGHTNAV_DIR", "nav"), "localization_mapping": ("LIGHTNAV_DIR", "localization"),
        "localization_localization": ("LIGHTNAV_DIR", "localization"), "bag_record": ("DRIVERS_DIR", "drive"),
    }
    for key, item in data.items():
        if not isinstance(item, dict) or set(item) - {"project", "service", "mode", "bag"} or (item.get("project"), item.get("service")) != expected[key]:
            raise ValueError("invalid service definition")
        if item.get("mode") != ({"localization_mapping": "mapping", "localization_localization": "localization"}.get(key)) or item.get("bag", False) is not (key == "bag_record"):
            raise ValueError("invalid service options")
    return data


def run(args, *, env=None, timeout=75):
    return subprocess.run(args, env=env, timeout=timeout, check=True, capture_output=True, text=True)


class Manager:
    def __init__(self, config, environ):
        self.config = config
        self.environ = environ
        for name in ("DRIVERS_DIR", "LIGHTNAV_DIR", "BAGS_DIR"):
            value = environ.get(name, "")
            if not value or not os.path.isabs(value) or not os.path.isdir(value):
                raise ValueError(f"{name} must be an existing absolute directory")

    def compose(self, item):
        path = self.environ[item["project"]]
        return ["docker", "compose", "--project-directory", path]

    def env(self, item):
        # Do not let the manager's environment override the project's .env.
        result = {k: v for k, v in self.environ.items() if k in ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG")}
        if "mode" in item:
            result["LIGHTNAV_LOCALIZATION_MODE"] = item["mode"]
        return result

    def action(self, key, action):
        item = self.config[key]
        env = self.env(item)
        if "mode" in item and action == "start":
            other = "localization_localization" if key == "localization_mapping" else "localization_mapping"
            if self.status(other)["running"]:
                raise ValueError("stop the other localization mode first")
        if item.get("bag"):
            if action == "stop":
                run(["docker", "kill", "--signal", "SIGINT", "bag-rec"])
                run(["docker", "wait", "bag-rec"], timeout=120)
                run(["docker", "rm", "bag-rec"])
            else:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                run(self.compose(item) + ["run", "-d", "--no-deps", "--name", "bag-rec", "-v", self.environ["BAGS_DIR"] + ":/bags", item["service"], "ros2", "bag", "record", "-o", "/bags/" + stamp, *TOPICS], env=env)
        else:
            args = ["up", "-d", "--no-deps", item["service"]] if action == "start" else ["stop", item["service"]]
            run(self.compose(item) + args, env=env)

    def status(self, key):
        item = self.config[key]
        if item.get("bag"):
            names = run(["docker", "ps", "-a", "--filter", "name=^/bag-rec$", "--format", "{{.ID}}"] ).stdout.splitlines()
        else:
            result = run(self.compose(item) + ["ps", "-a", "-q", item["service"]], env=self.env(item))
            names = result.stdout.splitlines()
        if not names:
            return {"id": key, "running": False, "started_at": None, "image_tag": None}
        details_list = json.loads(run(["docker", "inspect", *names]).stdout)
        if not item.get("bag"):
            details_list = [entry for entry in details_list if (entry["Config"].get("Labels") or {}).get("com.docker.compose.oneoff") != "True"]
        if not details_list:
            return {"id": key, "running": False, "started_at": None, "image_tag": None}
        details = details_list[0]
        running = details["State"]["Running"]
        if "mode" in item:
            settings = details["Config"].get("Cmd") or []
            running = running and "mode:=" + item["mode"] in settings
        return {"id": key, "running": running, "started_at": details["State"]["StartedAt"] if running else None, "image_tag": details["Config"]["Image"]}


class Handler(BaseHTTPRequestHandler):
    manager = None

    def respond(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_request(self):
        path = urlsplit(self.path)
        parts = path.path.strip("/").split("/")
        if path.query or path.fragment or self.headers.get("X-Requested-With") != "tsukuchalle-viewer":
            self.respond(400, {"error": "invalid request"}); return
        if self.command == "GET" and parts == ["services"]:
            try:
                with LOCK:
                    result = [self.manager.status(key) for key in self.manager.config]
                self.respond(200, result)
            except (subprocess.SubprocessError, OSError, ValueError, KeyError):
                logging.exception("status failed")
                self.respond(502, {"error": "status failed"})
            return
        if len(parts) != 3 or parts[0] != "services" or parts[1] not in self.manager.config or parts[2] not in ("start", "stop"):
            self.respond(404, {"error": "not found"}); return
        if self.command != "POST":
            self.respond(405, {"error": "method not allowed"}); return
        if self.headers.get("Content-Length", "0") != "0" or self.headers.get("Transfer-Encoding"):
            self.respond(400, {"error": "body not allowed"}); return
        try:
            with LOCK:
                self.manager.action(parts[1], parts[2])
            logging.info("action %s %s success", parts[1], parts[2])
            self.respond(200, {"ok": True})
        except (subprocess.SubprocessError, OSError, ValueError):
            logging.exception("action %s %s failed", parts[1], parts[2])
            self.respond(502, {"error": "action failed"})

    def send_error(self, code, message=None, explain=None):
        if code == 501:
            self.respond(405, {"error": "method not allowed"})
        else:
            super().send_error(code, message, explain)

    do_GET = handle_request
    do_POST = handle_request
    do_PUT = handle_request
    do_DELETE = handle_request
    do_PATCH = handle_request


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    Handler.manager = Manager(load_config(Path(__file__).with_name("services.json")), os.environ)
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("SERVICE_MANAGER_PORT", "8790"))), Handler).serve_forever()
