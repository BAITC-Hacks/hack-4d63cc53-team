@echo off
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0" || (
    echo ERROR: Could not open the project folder.
    goto :failed
)

set "VENV_PYTHON=.venv\Scripts\python.exe"

py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 (
    set "BOOTSTRAP_PYTHON=py -3"
    goto :python_found
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 (
    set "BOOTSTRAP_PYTHON=python"
    goto :python_found
)

echo ERROR: Python 3.10 or newer was not found.
echo Install Python 3.13 from https://www.python.org/downloads/windows/
echo During setup, select "Add Python to PATH", then run start.bat again.
goto :failed

:python_found
if not exist "backend\requirements.txt" (
    echo ERROR: backend\requirements.txt was not found.
    goto :failed
)

if not exist "%VENV_PYTHON%" (
    echo Creating .venv ...
    %BOOTSTRAP_PYTHON% -m venv .venv
    if errorlevel 1 (
        echo ERROR: Could not create .venv.
        goto :failed
    )
)

if not exist ".env" (
    if not exist ".env.example" (
        echo ERROR: .env.example was not found.
        goto :failed
    )
    echo Creating .env from .env.example ...
    copy /y ".env.example" ".env" >nul
    if errorlevel 1 (
        echo ERROR: Could not create .env.
        goto :failed
    )
)

echo Installing Python dependencies ...
"%VENV_PYTHON%" -m pip install --disable-pip-version-check -r "backend\requirements.txt"
if errorlevel 1 (
    echo ERROR: Dependency installation failed. Check the message above and try again.
    goto :failed
)

echo Starting the server at http://127.0.0.1:8000/
echo The browser will open after the health check succeeds.
echo Press Ctrl+C to stop the server.
"%VENV_PYTHON%" -m backend.launch
if errorlevel 1 goto :failed

endlocal
exit /b 0

:failed
echo.
echo Launch failed. Read the error above before closing this window.
pause
endlocal
exit /b 1