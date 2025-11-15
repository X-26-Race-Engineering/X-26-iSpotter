@echo off
REM iRacing Telemetry Dashboard Installer
REM This script installs dependencies and creates shortcuts

echo ============================================================
echo iRacing Telemetry Dashboard Installer
echo ============================================================
echo.

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM Check if pip is installed
echo [1/4] Checking pip installation...
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo pip is not installed. Installing pip...
    echo.
    
    REM Download get-pip.py
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%TEMP%\get-pip.py'"
    
    if not exist "%TEMP%\get-pip.py" (
        echo ERROR: Failed to download pip installer!
        pause
        exit /b 1
    )
    
    REM Install pip
    python "%TEMP%\get-pip.py"
    del "%TEMP%\get-pip.py" 2>nul
    
    REM Verify pip installation
    python -m pip --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Failed to install pip!
        echo Please install pip manually.
        pause
        exit /b 1
    )
)

python -m pip --version
echo.

echo [2/4] Installing required packages...
echo This may take a few minutes...
echo.

REM Upgrade pip first
python -m pip install --upgrade pip

REM Install packages one by one to better handle errors
echo Installing packages
python -m pip install -r requirements.txt
if errorlevel 1 goto :install_error

echo.
echo All packages installed successfully!
echo.

:create_shortcuts
echo [3/4] Creating desktop shortcut...

REM Create VBS script to make shortcut
set VBS_FILE="%TEMP%\create_shortcut.vbs"
(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sLinkFile = oWS.SpecialFolders("Desktop"^) ^& "\X-26 iSpotter.lnk"
echo Set oLink = oWS.CreateShortcut(sLinkFile^)
echo oLink.TargetPath = "%SCRIPT_DIR%run_telemetry.bat"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
echo oLink.Description = "X-26 iSpotter - iRacing Telemetry Dashboard"
echo oLink.WindowStyle = 1
echo If CreateObject("Scripting.FileSystemObject"^).FileExists("%SCRIPT_DIR%favicon.ico"^) Then
echo     oLink.IconLocation = "%SCRIPT_DIR%favicon.ico"
echo Else
echo     oLink.IconLocation = "%%SystemRoot%%\System32\SHELL32.dll,165"
echo End If
echo oLink.Save
) > %VBS_FILE%

cscript //nologo %VBS_FILE%
if exist %VBS_FILE% del %VBS_FILE%

echo.
echo [4/4] Creating launcher script...

REM Create the run script with better error handling
(
echo @echo off
echo title X-26 iSpotter - iRacing Telemetry
echo cd /d "%%~dp0"
echo.
echo echo ============================================================
echo echo X-26 iSpotter - iRacing Telemetry Dashboard
echo echo ============================================================
echo.
echo echo Starting telemetry server...
echo echo The dashboard will be available at: http://localhost:5000
echo.
echo echo Press Ctrl+C to stop the server
echo.
echo echo ============================================================
echo.
echo start http://localhost:5000
echo.
echo python app.py
echo.
echo if errorlevel 1 (
echo     echo.
echo     echo ERROR: Failed to start the server!
echo     echo Please check that Python and all dependencies are installed.
echo     echo.
echo     pause
echo ^)
) > run_telemetry.bat

echo.
echo ============================================================
echo Installation Complete!
echo ============================================================
echo.
echo A shortcut has been created on your desktop.
echo.
echo You can now:
echo   1. Double-click the desktop shortcut to start the server
echo   2. Run 'run_telemetry.bat' from this folder
echo   3. Run 'python app.py' manually
echo.
echo The dashboard will be available at: http://localhost:5000
echo.
echo ============================================================
echo.

REM Ask if user wants to start now
set /p START_NOW="Do you want to start the telemetry server now? (Y/N): "
if /i "%START_NOW%"=="Y" (
    echo.
    echo Starting server...
    echo.
    start "" "%SCRIPT_DIR%run_telemetry.bat"
)

pause
exit /b 0

:install_error
echo.
echo ERROR: Failed to install packages!
echo.
echo Please try running the following command manually:
echo   python -m pip install flask flask-socketio python-socketio python-engineio pyirsdk polars pandas pyyaml numpy
echo.
pause
exit /b 1