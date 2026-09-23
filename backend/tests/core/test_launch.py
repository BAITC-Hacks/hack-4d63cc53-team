from __future__ import annotations

import os
import socket
import unittest
from unittest.mock import patch

from backend import launch


class LaunchSocketTests(unittest.TestCase):
    def reserve_on_port(self, port: int):
        """Redirect the launcher's fixed port to a test-owned loopback port."""
        real_socket = socket.socket

        class RedirectedSocket:
            def __init__(self, *args, **kwargs):
                self.inner = real_socket(*args, **kwargs)

            def setsockopt(self, *args):
                return self.inner.setsockopt(*args)

            def bind(self, address):
                _, requested_port = address
                if requested_port == 8000:
                    address = ("127.0.0.1", port)
                return self.inner.bind(address)

            def listen(self, *args):
                return self.inner.listen(*args)

            def close(self):
                return self.inner.close()

        return patch.object(launch.socket, "socket", side_effect=RedirectedSocket)

    @staticmethod
    def free_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.bind(("127.0.0.1", 0))
            return probe.getsockname()[1]

    def test_reserves_available_local_port(self):
        with self.reserve_on_port(self.free_port()):
            server_socket = launch.reserve_local_port()
        self.assertIsNotNone(server_socket)
        server_socket.close()

    def test_rejects_port_already_owned_by_another_listener(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
            occupied.bind(("127.0.0.1", 0))
            occupied.listen()
            port = occupied.getsockname()[1]
            with self.reserve_on_port(port):
                server_socket = launch.reserve_local_port()
        self.assertIsNone(server_socket)

    @unittest.skipIf(os.name == "nt", "POSIX listener restart policy")
    def test_rebinds_after_tcp_exchange_leaves_server_side_time_wait(self):
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        port = listener.getsockname()[1]
        client = socket.create_connection(("127.0.0.1", port))
        accepted, _ = listener.accept()
        client.sendall(b"x")
        accepted.recv(1)
        accepted.close()
        client.close()
        listener.close()

        with self.reserve_on_port(port):
            rebound = launch.reserve_local_port()
        self.assertIsNotNone(rebound)
        rebound.close()


if __name__ == "__main__":
    unittest.main()
