@echo off
rem Windows half. Finds Node.js 22 or newer and runs: blinkling-run.cmd <mode> <script> [args].
rem A hook (any mode but mcp) that finds none exits 0 without a word.
setlocal EnableDelayedExpansion
set "MODE=%~1"
set "STATE=%BLINKLING_RUNTIME_DIR%"
if "%STATE%"=="" set "STATE=%USERPROFILE%\.blinkling\runtime"
set "NODE="
for %%P in ("%STATE%\node\node.exe" "%ProgramFiles%\nodejs\node.exe" "%LOCALAPPDATA%\Programs\nodejs\node.exe" "%ProgramFiles(x86)%\nodejs\node.exe" "%NVM_SYMLINK%\node.exe" "%USERPROFILE%\.volta\bin\node.exe" "%LOCALAPPDATA%\Volta\bin\node.exe") do (
  if not defined NODE if exist %%P (
    %%P -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >nul 2>nul && set "NODE=%%~P"
  )
)
if not defined NODE for /f "delims=" %%P in ('where node.exe 2^>nul') do (
  if not defined NODE (
    "%%P" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >nul 2>nul && set "NODE=%%P"
  )
)
if not defined NODE (
  if /i "%MODE%"=="mcp" (
    echo Blinkling needs Node.js 22 or newer. Install it from https://nodejs.org and restart Claude Code. 1>&2
    exit /b 1
  )
  exit /b 0
)
shift /1
set "ARGS="
:collect
if "%~1"=="" goto run
set ARGS=!ARGS! "%~1"
shift /1
goto collect
:run
"%NODE%" %ARGS%
exit /b %ERRORLEVEL%
