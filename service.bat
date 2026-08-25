@echo off
setlocal EnableDelayedExpansion

set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"
set "LOG_DIR=%PROJECT_DIR%logs"
set "BACKEND_PORT=5050"
set "FRONTEND_PORT=5000"

set "PYTHON_DIR=C:\Users\ccc\AppData\Local\Programs\Python\Python312"
set "PATH=%PYTHON_DIR%;%PYTHON_DIR%\Scripts;%PATH%"

if "%~1"=="" goto :menu
if /i "%~1"=="start"   goto :start
if /i "%~1"=="stop"    goto :stop
if /i "%~1"=="restart" goto :restart
if /i "%~1"=="status"  goto :status
if /i "%~1"=="logs"    goto :logs
echo Usage: service.bat ^<start^|stop^|restart^|status^|logs^>
goto :eof

::========================================================================
::  子程序：检查端口是否被监听
::  用法: call :port_in_use <port> <结果变量名>
::  结果: 0=被占用  1=空闲
::========================================================================
:port_in_use
set "%~2=1"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING"') do (
    set "%~2=0"
)
goto :eof

::========================================================================
::  子程序：杀掉占用指定端口的所有 PID
::========================================================================
:kill_port
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%~1 .*LISTENING"') do (
    taskkill /F /T /PID %%P >nul 2>&1
    echo     Killed PID %%P on port %~1
)
goto :eof

::========================================================================
::  菜单
::========================================================================
:menu
echo ============================================
echo   WenDao - Service Manager
echo ============================================
echo.
echo   [1] Start all services
echo   [2] Stop all services
echo   [3] Restart all services
echo   [4] Check service status
echo   [5] View logs folder
echo   [0] Exit
echo.
set /p choice="Select: "
if "%choice%"=="1" goto :start
if "%choice%"=="2" goto :stop
if "%choice%"=="3" goto :restart
if "%choice%"=="4" goto :status
if "%choice%"=="5" goto :logs
if "%choice%"=="0" goto :eof
echo Invalid selection
goto :menu

::========================================================================
::  启动
::========================================================================
:start
echo.
echo [START] Starting all services...

call :port_in_use %BACKEND_PORT% bak_used
if "!bak_used!"=="1" (
    echo [START] Backend service - port %BACKEND_PORT%
    start "" /D "%BACKEND_DIR%" /B cmd /c "python run.py"
) else (
    echo [SKIP] Backend already running on port %BACKEND_PORT%
)

call :port_in_use %FRONTEND_PORT% fe_used
if "!fe_used!"=="1" (
    echo [START] Frontend service - port %FRONTEND_PORT%
    start "" /D "%FRONTEND_DIR%" /B cmd /c "npm run dev"
) else (
    echo [SKIP] Frontend already running on port %FRONTEND_PORT%
)

:: 等待并确认启动结果（ping 做延迟，兼容无控制台输入的环境）
echo [WAIT] Waiting 6 seconds for services to initialize...
ping -n 7 127.0.0.1 >nul

call :port_in_use %BACKEND_PORT% bak_used
if "!bak_used!"=="0" (
    echo [OK] Backend ready: http://localhost:%BACKEND_PORT%
) else (
    echo [WARN] Backend failed to start, please check manually
)

call :port_in_use %FRONTEND_PORT% fe_used
if "!fe_used!"=="0" (
    echo [OK] Frontend ready: http://localhost:%FRONTEND_PORT%
) else (
    echo [WARN] Frontend failed to start, please check manually
)

echo.
echo [DONE] Startup complete.
echo         Backend API: http://localhost:%BACKEND_PORT%
echo         Frontend UI: http://localhost:%FRONTEND_PORT%
goto :eof

::========================================================================
::  停止
::========================================================================
:stop
echo.
echo [STOP] Stopping all services...

set "stopped=0"

call :port_in_use %BACKEND_PORT% bak_used
if "!bak_used!"=="0" (
    echo [STOP] Stopping backend on port %BACKEND_PORT%...
    call :kill_port %BACKEND_PORT%
    set "stopped=1"
) else (
    echo [INFO] Backend not running on port %BACKEND_PORT%
)

call :port_in_use %FRONTEND_PORT% fe_used
if "!fe_used!"=="0" (
    echo [STOP] Stopping frontend on port %FRONTEND_PORT%...
    call :kill_port %FRONTEND_PORT%
    set "stopped=1"
) else (
    echo [INFO] Frontend not running on port %FRONTEND_PORT%
)

:: 确认端口已释放
ping -n 3 127.0.0.1 >nul
call :port_in_use %BACKEND_PORT% bak_left
call :port_in_use %FRONTEND_PORT% fe_left
if "!bak_left!"=="0" (
    echo [RETRY] Backend port still occupied, force retry...
    call :kill_port %BACKEND_PORT%
)
if "!fe_left!"=="0" (
    echo [RETRY] Frontend port still occupied, force retry...
    call :kill_port %FRONTEND_PORT%
)

if "!stopped!"=="1" (
    echo [DONE] All services stopped
) else (
    echo [INFO] No services were running
)
goto :eof

::========================================================================
::  重启
::========================================================================
:restart
echo.
echo [RESTART] Restarting all services...
call :stop
echo [RESTART] Waiting for ports to be released...
ping -n 4 127.0.0.1 >nul
call :start
goto :eof

::========================================================================
::  状态
::========================================================================
:status
echo.
echo ============================================
echo   Service Status
echo ============================================

set "running=0"

call :port_in_use %BACKEND_PORT% bak_used
if "!bak_used!"=="0" (
    echo   Backend port %BACKEND_PORT% - RUNNING
    set "running=1"
) else (
    echo   Backend port %BACKEND_PORT% - STOPPED
)

call :port_in_use %FRONTEND_PORT% fe_used
if "!fe_used!"=="0" (
    echo   Frontend port %FRONTEND_PORT% - RUNNING
    set "running=1"
) else (
    echo   Frontend port %FRONTEND_PORT% - STOPPED
)

echo.
if "!running!"=="1" (
    echo   Services are running
) else (
    echo   No services are currently running
)
echo ============================================
goto :eof

::========================================================================
::  日志文件夹
::========================================================================
:logs
echo.
echo [LOGS] Opening logs folder...
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
explorer "%LOG_DIR%"
goto :eof
