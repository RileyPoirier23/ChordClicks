@echo off
rem ChordClicks - run the virtual camera setup with an admin prompt.
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-virtualcam.ps1\"'"
