@echo off
setlocal EnableExtensions
REM Wrapper for trace_tree.py (search / add / move / delete).

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%~dp0trace_tree.py" %*
  exit /b %ERRORLEVEL%
)
where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 "%~dp0trace_tree.py" %*
  exit /b %ERRORLEVEL%
)
echo ERROR: Python not found on PATH 1>&2
exit /b 1
