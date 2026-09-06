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
set "KEEPADC=0"
powershell -NoProfile -Command "$p = @(Get-CimInstance Win32_Process -Filter \"Name='albiondata-client.exe'\"); if ($p | Where-Object { $_.CommandLine -match '127\.0\.0\.1:3001' }) { exit 0 }; exit 1" >nul 2>&1
if not errorlevel 1 set "KEEPADC=1"
if "%KEEPADC%"=="1" goto open

taskkill /IM albiondata-client.exe /F >nul 2>&1
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "$p = @(Get-CimInstance Win32_Process -Filter \"Name='albiondata-client.exe'\"); if ($p.Count -gt 0) { exit 1 }; exit 0" >nul 2>&1
if errorlevel 1 (
  echo ADC yonetici olarak acik; kamu AODP'ye gidiyor. ADC penceresini kapat, sonra start.bat tekrar calistir.
  timeout /t 5 /nobreak >nul
)
if exist "%ADC%" (
  start "" "%ADC%" -i http://127.0.0.1:3001,http+pow://pow.europe.albion-online-data.com
) else (
  echo Albion Data Client bulunamadi: %ADC%
  timeout /t 3 /nobreak >nul
)

:open
start "" http://localhost:3000
