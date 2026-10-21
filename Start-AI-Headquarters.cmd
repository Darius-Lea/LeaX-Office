@echo off
setlocal
rem This changes PowerShell policy for this process only. It does not disable signature checks.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0scripts\local-setup.ps1" -SourceDirectory "%~dp0."
if errorlevel 1 (
  echo.
  echo Setup stopped. If Windows blocked this trusted download, see LOCAL_INSTALL.md.
  pause
)
endlocal
