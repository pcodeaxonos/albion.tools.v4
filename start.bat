@echo off
setlocal

REM ============================================================
REM AYARLAR
REM ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cd /d "%ROOT%"

REM Optional local runtime; keep the selected executable outside version control.
if not defined ALBION_NODE if exist ".albion-node.path" set /p "ALBION_NODE="<".albion-node.path"
if defined ALBION_NODE if exist "%ALBION_NODE%" (
    for %%N in ("%ALBION_NODE%") do set "PATH=%%~dpN;%PATH%"
)

REM SQLite and verified online backups require Node.js 22.16+.
node -e "const [major,minor]=process.versions.node.split('.').map(Number); if(major<22 || (major===22 && minor<16)) { console.error('Node.js 22.16+ gerekli. Mevcut: '+process.versions.node); process.exit(1); }"
if errorlevel 1 exit /b 1

set "ADC=F:\Program Files\Albion Data Client\albiondata-client.exe"
set "LOGDIR=%ROOT%\logs"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"


REM ============================================================
REM Start all services and wait for HTTP readiness before opening the app.
REM ============================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\content\scripts\start-services.ps1"
if errorlevel 1 (
    echo Hub baslatilamadi. logs klasorundeki hata dosyalarini kontrol edin.
    pause
    exit /b 1
)

start "" "C:\Program Files\Google\Chrome\Application\chrome_proxy.exe" --profile-directory="Profile 1" --app-id=hbblfifohofgngfbjbiimbbcimepbdcb

REM ============================================================
REM ADC CALISIYOR MU?
REM ============================================================

:CHECKADC

tasklist /FI "IMAGENAME eq albiondata-client.exe" 2>nul | find /I "albiondata-client.exe" >nul 2>&1

if errorlevel 1 goto STARTADC


REM ============================================================
REM ADC DOGRU ENDPOINT ILE MI CALISIYOR?
REM ============================================================

powershell.exe -NoProfile -WindowStyle Hidden -Command "$p=Get-CimInstance Win32_Process -Filter \"Name='albiondata-client.exe'\"; if($p | Where-Object {$_.CommandLine -match '127\.0\.0\.1:3001'}){exit 0}else{exit 1}" >nul 2>&1

if not errorlevel 1 goto HIDEADC


REM ============================================================
REM ADC CALISIYOR AMA YANLIS PARAMETREYLE
REM ============================================================

taskkill /IM albiondata-client.exe /F >nul 2>&1

timeout /t 1 /nobreak >nul

goto STARTADC


REM ============================================================
REM ADC'YI BASLAT
REM ============================================================

:STARTADC

if not exist "%ADC%" (
    echo Albion Data Client bulunamadi:
    echo %ADC%
    timeout /t 3 /nobreak >nul
    goto FINISH
)

powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%ADC%' -ArgumentList '-minimize','-i','http://127.0.0.1:3001,http+pow://pow.europe.albion-online-data.com' -WorkingDirectory '%LOGDIR%' -WindowStyle Hidden"


REM ============================================================
REM ADC PROCESS'INI BEKLE
REM ============================================================

set /a WAITADC=0

:WAITADC

tasklist /FI "IMAGENAME eq albiondata-client.exe" 2>nul | find /I "albiondata-client.exe" >nul 2>&1

if not errorlevel 1 goto HIDEADC

set /a WAITADC+=1

if %WAITADC% GEQ 15 goto FINISH

timeout /t 1 /nobreak >nul
goto WAITADC


REM ============================================================
REM ADC GUI'YI TASKBAR'DAN VE EKRANDAN GIZLE
REM
REM Pencereler ADC process kimliginden bulunur.
REM Izleyici ADC kapanana kadar yeniden acilan pencereleri de gizler.
REM
REM WS_EX_TOOLWINDOW eklenir
REM WS_EX_APPWINDOW kaldirilir
REM SW_HIDE ile pencere tamamen gizlenir
REM Tray ikonu ve ADC process calismaya devam eder
REM ============================================================

:HIDEADC

timeout /t 1 /nobreak >nul

powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',('\"' + '%ROOT%\content\scripts\hide-adc.ps1' + '\"') -WindowStyle Hidden -RedirectStandardError '%LOGDIR%\hide-adc-error.log'"


REM ============================================================
REM BITIR
REM ============================================================

:FINISH

endlocal
exit /b
