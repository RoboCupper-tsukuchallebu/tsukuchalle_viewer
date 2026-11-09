import importlib.util
import json
import os
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch, call

spec = importlib.util.spec_from_file_location("manager", Path(__file__).with_name("manager.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
CONFIG = m.load_config(Path(__file__).with_name("services.json"))
ENV = {"DRIVERS_DIR": "/tmp", "LIGHTNAV_DIR": "/tmp", "BAGS_DIR": "/tmp", "PATH": "/bin"}

class Tests(unittest.TestCase):
    def test_config_rejects_unexpected(self):
        with patch.object(m.Path, "read_text", return_value=json.dumps({**CONFIG, "other": {}})):
            with self.assertRaises(ValueError): m.load_config("unused")

    @patch.object(m, "run")
    def test_compose_argv_and_bag_stop(self, run):
        manager = m.Manager(CONFIG, ENV)
        manager.action("drive", "start")
        run.assert_called_with(["docker", "compose", "--project-directory", "/tmp", "up", "-d", "--no-deps", "drive"], env={"PATH": "/bin"})
        run.reset_mock()
        manager.action("bag_record", "stop")
        self.assertEqual(run.call_args_list, [call(["docker", "kill", "--signal", "SIGINT", "bag-rec"]), call(["docker", "wait", "bag-rec"], timeout=120), call(["docker", "rm", "bag-rec"])])

    def test_requests(self):
        m.Handler.manager = m.Manager(CONFIG, ENV)
        server = ThreadingHTTPServer(("127.0.0.1", 0), m.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            conn = HTTPConnection("127.0.0.1", server.server_port)
            for method, path, headers, status in [("GET", "/services", {}, 400), ("POST", "/services/no/start", {"X-Requested-With": "tsukuchalle-viewer"}, 404), ("GET", "/services/drive/start", {"X-Requested-With": "tsukuchalle-viewer"}, 405)]:
                conn.request(method, path, headers=headers); response = conn.getresponse(); self.assertEqual(response.status, status); response.read()
            conn.close()
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == "__main__": unittest.main()
