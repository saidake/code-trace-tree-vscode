@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Ask Code Trace Tree (JetBrains / VS Code) to reload global storage for this project.

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
REM Epoch milliseconds via PowerShell (available on modern Windows).
for /f %%T in ('powershell -NoProfile -Command "[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()"') do set "MS=%%T"
if not defined MS (
  for /f %%T in ('powershell -NoProfile -Command "[int64]((Get-Date).ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds"') do set "MS=%%T"
)

for %%F in (.idea .vscode) do (
  if not exist "%PROJECT_ROOT%\%%F\" mkdir "%PROJECT_ROOT%\%%F"
  set "REQUEST=%PROJECT_ROOT%\%%F\code-trace-tree.refresh-request"
  > "!REQUEST!" echo %MS%
  echo wrote=!REQUEST!
)

echo IDE should reload Code Trace Tree data if the project is open with the plugin.
exit /b 0
