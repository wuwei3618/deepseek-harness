@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
rem Keep audit sessions and settings apart from DeepSeek Harness in %USERPROFILE%\.dsh, as the Desktop application does.
if not defined DSH_HOME set "DSH_HOME=%USERPROFILE%\.cscec8b-audit-agent"
"%~dp0..\..\..\..\CSCEC8B Audit Agent.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
