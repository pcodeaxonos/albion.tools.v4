@echo off
setlocal

REM ============================================================
REM AYARLAR
REM ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cd /d "%ROOT%"

set "ADC=F:\Program Files\Albion Data Client\albiondata-client.exe"
set "LOGDIR=%ROOT%\logs"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"


REM ============================================================
REM WEB SERVER :3000
REM ============================================================

netstat -ano | findstr /C:":3000" | findstr "LISTENING" >nul 2>&1

if errorlevel 1 (
    powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/d','/c','npm run serve' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput '%LOGDIR%\serve.log' -RedirectStandardError '%LOGDIR%\serve-error.log'"
)


REM ============================================================
REM PRICE SERVER :3001
REM ============================================================

netstat -ano | findstr /C:":3001" | findstr "LISTENING" >nul 2>&1

if errorlevel 1 (
    powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/d','/c','npm run prices' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput '%LOGDIR%\prices.log' -RedirectStandardError '%LOGDIR%\prices-error.log'"
)


REM ============================================================
REM 3000 PORTUNU BEKLE
REM ============================================================

set /a WAIT3000=0

:WAIT3000

netstat -ano | findstr /C:":3000" | findstr "LISTENING" >nul 2>&1

if not errorlevel 1 goto OPENBROWSER

set /a WAIT3000+=1

if %WAIT3000% GEQ 30 goto OPENBROWSER

timeout /t 1 /nobreak >nul
goto WAIT3000


REM ============================================================
REM BROWSER
REM
REM ADC'DEN ONCE ACILIR.
REM ADC TARAFINDA HATA OLSA BILE BURAYA ULASILMIS OLUR.
REM ============================================================

:OPENBROWSER

start "" "http://localhost:3000/"


REM ============================================================
REM 3001 PORTUNU BEKLE
REM ============================================================

set /a WAIT3001=0

:WAIT3001

netstat -ano | findstr /C:":3001" | findstr "LISTENING" >nul 2>&1

if not errorlevel 1 goto CHECKADC

set /a WAIT3001+=1

if %WAIT3001% GEQ 30 goto CHECKADC

timeout /t 1 /nobreak >nul
goto WAIT3001


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

powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%ADC%' -ArgumentList '-minimize','-i','http://127.0.0.1:3001,http+pow://pow.europe.albion-online-data.com' -WindowStyle Hidden"


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
REM Debug ile tespit edilen pencere:
REM Class = WailsWebviewWindow
REM Title = Albion Data Client
REM
REM WS_EX_TOOLWINDOW eklenir
REM WS_EX_APPWINDOW kaldirilir
REM SW_HIDE ile pencere tamamen gizlenir
REM Tray ikonu ve ADC process calismaya devam eder
REM ============================================================

:HIDEADC

timeout /t 1 /nobreak >nul

powershell.exe -NoProfile -WindowStyle Hidden -Command "$code='using System; using System.Runtime.InteropServices; public static class W { [DllImport(\"user32.dll\",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c,string t); [DllImport(\"user32.dll\",EntryPoint=\"GetWindowLongPtrW\")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int i); [DllImport(\"user32.dll\",EntryPoint=\"SetWindowLongPtrW\")] public static extern IntPtr SetWindowLongPtr(IntPtr h,int i,IntPtr v); [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h,int n); }'; Add-Type -TypeDefinition $code; $end=(Get-Date).AddSeconds(10); do { $h=[W]::FindWindow('WailsWebviewWindow','Albion Data Client'); if($h -ne [IntPtr]::Zero){ $s=[W]::GetWindowLongPtr($h,-20).ToInt64(); $s=($s -bor 0x80) -band (-bnot 0x40000); [void][W]::SetWindowLongPtr($h,-20,[IntPtr]$s); [void][W]::SetWindowPos($h,[IntPtr]::Zero,0,0,0,0,0x27); [void][W]::ShowWindow($h,0); break }; Start-Sleep -Milliseconds 250 } while((Get-Date) -lt $end)" >nul 2>&1


REM ============================================================
REM BITIR
REM ============================================================

:FINISH

endlocal
exit /b