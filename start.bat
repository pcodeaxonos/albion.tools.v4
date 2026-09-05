@echo off
cd /d "%~dp0"

set "ADC=F:\Program Files\Albion Data Client\albiondata-client.exe"

netstat -ano | findstr /C:":3000" | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  start "albion.tools.v4" cmd /k npm run serve
)

netstat -ano | findstr /C:":3001" | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  start "albion.tools prices" cmd /k npm run prices
)

set /a n=0
:wait3000
netstat -ano | findstr /C:":3000" | findstr LISTENING >nul 2>&1
if not errorlevel 1 goto wait3001
set /a n+=1
if %n% GEQ 30 goto wait3001
timeout /t 1 /nobreak >nul
goto wait3000

:wait3001
set /a n=0
:wait3001loop
netstat -ano | findstr /C:":3001" | findstr LISTENING >nul 2>&1
if not errorlevel 1 goto adc
set /a n+=1
if %n% GEQ 30 goto adc
timeout /t 1 /nobreak >nul
goto wait3001loop

:adc
tasklist /FI "IMAGENAME eq albiondata-client.exe" | findstr /I /C:"albiondata-client.exe" >nul 2>&1
if not errorlevel 1 goto open
if exist "%ADC%" (
  start "" "%ADC%" -i http://127.0.0.1:3001
) else (
  echo Albion Data Client bulunamadi: %ADC%
  timeout /t 3 /nobreak >nul
)

:open
start "" http://localhost:3000
