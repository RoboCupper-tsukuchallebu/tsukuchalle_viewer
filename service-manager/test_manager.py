import importlib.util
import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch, call, Mock

module_specification = importlib.util.spec_from_file_location("manager", Path(__file__).with_name("manager.py"))
manager_module = importlib.util.module_from_spec(module_specification)
module_specification.loader.exec_module(manager_module)
SERVICE_CONFIG = manager_module.load_config(Path(__file__).with_name("services.json"))
TEST_ENVIRONMENT = {"DRIVERS_DIR": "/tmp", "LIGHTNAV_DIR": "/tmp", "BAGS_DIR": "/tmp", "PATH": "/bin"}

class Tests(unittest.TestCase):
    def test_config_rejects_unexpected(self):
        with patch.object(manager_module.Path, "read_text", return_value=json.dumps({**SERVICE_CONFIG, "other": {}})):
            with self.assertRaises(ValueError): manager_module.load_config("unused")

    @patch.object(manager_module, "run")
    def test_compose_argv_and_bag_stop(self, run):
        manager = manager_module.Manager(SERVICE_CONFIG, TEST_ENVIRONMENT)
        manager.action("drive", "start")
        run.assert_called_with(["docker", "compose", "--project-directory", "/tmp", "up", "-d", "--no-deps", "drive"], environment={"PATH": "/bin"})
        run.reset_mock()
        run.return_value.stdout = "running\n"
        manager.action("bag_record", "stop")
        self.assertEqual(run.call_args_list, [call(["docker", "ps", "-a", "--filter", "name=^/bag-rec$", "--format", "{{.State}}"]), call(["docker", "kill", "--signal", "SIGINT", "bag-rec"]), call(["docker", "wait", "bag-rec"], timeout=120), call(["docker", "rm", "bag-rec"])])


    @patch.object(manager_module, "run")
    def test_bag_start_and_localization_stop(self, run):
        manager = manager_module.Manager(SERVICE_CONFIG, TEST_ENVIRONMENT)
        with patch.object(manager_module, "datetime") as clock:
            clock.now.return_value.strftime.return_value = "20261109T000000Z"
            manager.action("bag_record", "start")
        run.assert_called_with(["docker", "compose", "--project-directory", "/tmp", "run", "-d", "--no-deps", "--name", "bag-rec", "-v", "/tmp:/bags", "drive", "ros2", "bag", "record", "-o", "/bags/20261109T000000Z", *manager_module.TOPICS], environment={"PATH": "/bin"})
        manager.action("localization_mapping", "stop")
        run.assert_called_with(["docker", "compose", "--project-directory", "/tmp", "stop", "localization"], environment={"PATH": "/bin", "LIGHTNAV_LOCALIZATION_MODE": "mapping"})

    @patch.object(manager_module.subprocess, "run")
    def test_subprocess_never_uses_shell(self, subprocess_run):
        subprocess_run.return_value = Mock()
        manager_module.run(["docker", "ps"])
        self.assertNotIn("shell", subprocess_run.call_args.kwargs)

    @patch.object(manager_module, "run")
    def test_stopped_bag_is_removed_before_start_and_on_stop(self, run):
        manager = manager_module.Manager(SERVICE_CONFIG, TEST_ENVIRONMENT)
        run.return_value.stdout = "exited\n"
        with patch.object(manager_module, "datetime") as clock:
            clock.now.return_value.strftime.return_value = "20261109T000000Z"
            manager.action("bag_record", "start")
        self.assertEqual(run.call_args_list, [
            call(["docker", "ps", "-a", "--filter", "name=^/bag-rec$", "--format", "{{.State}}"]),
            call(["docker", "rm", "bag-rec"]),
            call(["docker", "compose", "--project-directory", "/tmp", "run", "-d", "--no-deps", "--name", "bag-rec", "-v", "/tmp:/bags", "drive", "ros2", "bag", "record", "-o", "/bags/20261109T000000Z", *manager_module.TOPICS], environment={"PATH": "/bin"}),
        ])
        run.reset_mock()
        manager.action("bag_record", "stop")
        self.assertEqual(run.call_args_list, [call(["docker", "ps", "-a", "--filter", "name=^/bag-rec$", "--format", "{{.State}}"]), call(["docker", "rm", "bag-rec"])])
        run.return_value.stdout = "running\n"
        with self.assertRaises(ValueError):
            manager.action("bag_record", "start")

    def test_requests(self):
        manager_module.Handler.manager = manager_module.Manager(SERVICE_CONFIG, TEST_ENVIRONMENT)
        server = ThreadingHTTPServer(("127.0.0.1", 0), manager_module.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            connection = HTTPConnection("127.0.0.1", server.server_port)
            for method, path, headers, status in [("GET", "/services", {}, 400), ("POST", "/services/no/start", {"X-Requested-With": "tsukuchalle-viewer"}, 404), ("GET", "/services/drive/start", {"X-Requested-With": "tsukuchalle-viewer"}, 405)]:
                connection.request(method, path, headers=headers); response = connection.getresponse(); self.assertEqual(response.status, status); response.read()
            with patch.object(manager_module.Handler.manager, "status", return_value={}):
                for host, expected in [(f"localhost:{server.server_port}", 200), (f"127.0.0.1:{server.server_port}", 200), ("invalid.example", 403)]:
                    connection.request("GET", "/services", headers={"Host": host, "X-Requested-With": "tsukuchalle-viewer"})
                    response = connection.getresponse()
                    self.assertEqual(response.status, expected)
                    response.read()
            connection.close()
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == "__main__": unittest.main()
