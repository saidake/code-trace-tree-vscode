@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Resolve Code Trace Tree project id + bound global XML for the current project.

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
if defined LOCALAPPDATA (
  set "APP_DIR=%LOCALAPPDATA%\code-trace-tree"
) else (
  set "APP_DIR=%USERPROFILE%\AppData\Local\code-trace-tree"
)

set "PROJECT_ID="
if exist "%PROJECT_ROOT%\.idea\code-trace-tree.project.id" (
  set /p PROJECT_ID=<"%PROJECT_ROOT%\.idea\code-trace-tree.project.id"
) else if exist "%PROJECT_ROOT%\.vscode\code-trace-tree.project.id" (
  set /p PROJECT_ID=<"%PROJECT_ROOT%\.vscode\code-trace-tree.project.id"
)
if defined PROJECT_ID (
  for /f "tokens=* delims= " %%A in ("!PROJECT_ID!") do set "PROJECT_ID=%%A"
)

set "STORAGE_XML="
if not exist "%APP_DIR%\" goto print_result

if defined PROJECT_ID (
  for %%F in ("%APP_DIR%\*.xml") do (
    if not defined STORAGE_XML (
      for /f "usebackq tokens=*" %%L in (`findstr /i /c:"<projectId>" "%%~fF"`) do (
        set "LINE=%%L"
        set "LINE=!LINE:*<projectId>=!"
        for /f "delims=<" %%V in ("!LINE!") do set "PID=%%V"
        if /I "!PID!"=="!PROJECT_ID!" set "STORAGE_XML=%%~fF"
      )
    )
  )
)

if not defined STORAGE_XML (
  for %%F in ("%APP_DIR%\*.xml") do (
    if not defined STORAGE_XML (
      for /f "usebackq tokens=*" %%L in (`findstr /i /c:"<path>" "%%~fF"`) do (
        set "LINE=%%L"
        set "LINE=!LINE:*<path>=!"
        for /f "delims=<" %%V in ("!LINE!") do set "STORED=%%V"
        if /I "!STORED!"=="!PROJECT_ROOT!" set "STORAGE_XML=%%~fF"
      )
    )
  )
)

:print_result
echo project_root=%PROJECT_ROOT%
echo global_dir=%APP_DIR%
echo project_id=%PROJECT_ID%
echo storage_xml=%STORAGE_XML%

if not defined STORAGE_XML (
  echo ERROR: no Code Trace Tree storage XML found. Open the project once in the IDE with the plugin installed. 1>&2
  exit /b 2
)
exit /b 0
