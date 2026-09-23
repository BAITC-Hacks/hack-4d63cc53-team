#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd -P) || {
    echo "ERROR: Could not open the project folder." >&2
    exit 1
}
cd "$SCRIPT_DIR" || exit 1

VENV_DIR=.venv
VENV_PYTHON=$VENV_DIR/bin/python

is_supported_python() {
    "$1" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' >/dev/null 2>&1
}

find_bootstrap_python() {
    for candidate in python3 python; do
        if command -v "$candidate" >/dev/null 2>&1 && is_supported_python "$candidate"; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

if [ ! -f backend/requirements.txt ]; then
    echo "ERROR: backend/requirements.txt was not found." >&2
    exit 1
fi

if [ -e "$VENV_DIR" ] || [ -L "$VENV_DIR" ]; then
    if [ ! -x "$VENV_PYTHON" ]; then
        echo "ERROR: .venv exists, but .venv/bin/python is unavailable." >&2
        echo "It may be a Windows virtual environment. Use a separate clone on macOS/Linux" >&2
        echo "or recreate .venv manually; this script will not overwrite it." >&2
        exit 1
    fi
    if ! is_supported_python "$VENV_PYTHON"; then
        echo "ERROR: .venv/bin/python must be Python 3.10 or newer." >&2
        echo "Use a separate clone on macOS/Linux or recreate .venv manually." >&2
        exit 1
    fi
else
    BOOTSTRAP_PYTHON=$(find_bootstrap_python) || {
        echo "ERROR: Python 3.10 or newer was not found." >&2
        echo "Install Python 3.10+ and run ./start.sh again." >&2
        exit 1
    }
    echo "Creating .venv ..."
    "$BOOTSTRAP_PYTHON" -m venv "$VENV_DIR" || {
        echo "ERROR: Could not create .venv." >&2
        echo "On Linux, install the python3-venv package if it is missing." >&2
        exit 1
    }
    if [ ! -x "$VENV_PYTHON" ]; then
        echo "ERROR: .venv was created without a runnable Python executable." >&2
        exit 1
    fi
fi

if [ -e .env ] || [ -L .env ]; then
    if [ ! -f .env ]; then
        echo "ERROR: .env exists but is not a regular file." >&2
        echo "Move or remove it manually, then run ./start.sh again." >&2
        exit 1
    fi
else
    if [ ! -f .env.example ]; then
        echo "ERROR: .env.example was not found." >&2
        exit 1
    fi
    echo "Creating .env from .env.example ..."
    cp .env.example .env || {
        echo "ERROR: Could not create .env." >&2
        exit 1
    }
fi

if ! "$VENV_PYTHON" -m pip --version >/dev/null 2>&1; then
    echo "ERROR: pip is unavailable in .venv." >&2
    echo "Recreate .venv manually and run ./start.sh again." >&2
    exit 1
fi

echo "Installing Python dependencies ..."
"$VENV_PYTHON" -m pip install --disable-pip-version-check -r backend/requirements.txt || {
    echo "ERROR: Dependency installation failed. Check the message above and try again." >&2
    exit 1
}

echo "Starting the server at http://127.0.0.1:8000/"
echo "The browser will open after the health check succeeds."
echo "Press Ctrl+C to stop the server."
exec "$VENV_PYTHON" -m backend.launch