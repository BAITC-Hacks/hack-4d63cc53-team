"""Run the local server and open a browser after its health check succeeds."""

from __future__ import annotations

import os
import socket
import threading
import time
import urllib.error
import urllib.request
import webbrowser

import uvicorn


URL = "http://127.0.0.1:8000/"
HEALTH_URL = f"{URL}api/health"


def open_browser_when_ready(stopped: threading.Event) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + 30
    while not stopped.is_set() and time.monotonic() < deadline:
        try:
            with opener.open(HEALTH_URL, timeout=1) as response:
                if response.status == 200:
                    if stopped.is_set():
                        return
                    try:
                        opened = webbrowser.open(URL)
                    except (OSError, webbrowser.Error):
                        opened = False
                    if not opened:
                        print(f"Open this address in your browser: {URL}")
                    return
        except (OSError, urllib.error.URLError):
            pass
        stopped.wait(0.25)
    if not stopped.is_set():
        print(f"Browser was not opened: server readiness timed out. Check the logs, then open {URL}")


def reserve_local_port() -> socket.socket | None:
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if os.name != "nt":
            server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind(("127.0.0.1", 8000))
        server_socket.listen()
    except OSError as error:
        server_socket.close()
        print("ERROR: Cannot bind to 127.0.0.1:8000. The port may already be in use.")
        print("Stop the process that owns port 8000, then run the launcher again.")
        print(f"Details: {error}")
        return None
    return server_socket


def main() -> int:
    server_socket = reserve_local_port()
    if server_socket is None:
        return 1

    stopped = threading.Event()
    threading.Thread(target=open_browser_when_ready, args=(stopped,), daemon=True).start()
    config = uvicorn.Config("backend.app:app", host="127.0.0.1", port=8000)
    server = uvicorn.Server(config)
    try:
        server.run(sockets=[server_socket])
    except KeyboardInterrupt:
        return 0
    finally:
        stopped.set()
        server_socket.close()
    return 0 if server.started else 1


if __name__ == "__main__":
    raise SystemExit(main())