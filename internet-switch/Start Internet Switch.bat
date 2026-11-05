@echo off
REM Double-click this to start the Internet Switch and open it in your browser.
cd /d "%~dp0"
start "" http://localhost:8787
python internet_switch.py
if errorlevel 1 py internet_switch.py
pause
