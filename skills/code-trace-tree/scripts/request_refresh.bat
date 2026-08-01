@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Ask IntelliJ (Code Trace Tree plugin) to reload global storage for this project.

set "START=%~1"
if "%START%"=="" set "START=%CD%"
if exist "%START%\" (
  pushd "%START%" >nul 2>&1
) else if exist "%START%" (
  pushd "%~dp1" >nul 2>&1
) else (
  echo ERROR: could not locate project root from %START% 1>&2
  exit /b 1
)
set "CUR=%CD%"
popd >nul 2>&1

set "PROJECT_ROOT="
:find_root
if exist "%CUR%\.idea\" goto found_root
if exist "%CUR%\.vscode\" goto found_root
if exist "%CUR%\.git\" goto found_root
if exist "%CUR%\.git" goto found_root
for %%I in ("%CUR%\..") do set "PARENT=%%~fI"
if /I "%PARENT%"=="%CUR%" goto no_root
set "CUR=%PARENT%"
goto find_root

:found_root
set "PROJECT_ROOT=%CUR%"
goto after_root

:no_root
echo ERROR: could not locate project root from %START% 1>&2
exit /b 1

:after_root
set "PROJECT_ID="
if exist "%PROJECT_ROOT%\.idea\code-trace-tree.project.id" (
  set /p PROJECT_ID=<"%PROJECT_ROOT%\.idea\code-trace-tree.project.id"
) else if exist "%PROJECT_ROOT%\.vscode\code-trace-tree.project.id" (
  set /p PROJECT_ID=<"%PROJECT_ROOT%\.vscode\code-trace-tree.project.id"
)
if defined PROJECT_ID (
  for /f "tokens=* delims= " %%A in ("!PROJECT_ID!") do set "PROJECT_ID=%%A"
)
if not defined PROJECT_ID (
  echo ERROR: no project id file. Open the project once in the IDE with the plugin installed. 1>&2
  exit /b 2
)

if defined LOCALAPPDATA (
  set "APP_DIR=%LOCALAPPDATA%\code-trace-tree"
) else (
  set "APP_DIR=%USERPROFILE%\AppData\Local\code-trace-tree"
)
set "SIGNALS=%APP_DIR%\signals"
if not exist "%SIGNALS%\" mkdir "%SIGNALS%"
set "REQUEST=%SIGNALS%\%PROJECT_ID%.request_refresh"

for /f %%T in ('powershell -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()"') do set "MS=%%T"
if not defined MS (
  for /f %%T in ('powershell -NoProfile -Command "[int64]((Get-Date).ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds"') do set "MS=%%T"
)

> "%REQUEST%" echo %MS%
echo wrote=%REQUEST%
echo IDE should reload Code Trace Tree data if the project is open with the plugin (signal TTL 60s).
exit /b 0
