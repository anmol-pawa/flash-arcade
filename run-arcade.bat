@echo off
rem Thin wrapper so the desktop shortcut's target never has to change. All
rem real logic lives in run-arcade.ps1 -- see it (and CLAUDE.md items 15-16)
rem for why this used to be a batch script and why that kept breaking only
rem on a real double-click.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-arcade.ps1"
