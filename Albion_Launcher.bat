@echo off
cd /d "%~dp0"

REM ============================================================
REM ALBION ONLINE - STEAM
REM ============================================================

start "" "steam://rungameid/761890"


REM ============================================================
REM STATISTICS ANALYSIS TOOL
REM Aciksa tekrar acma
REM ============================================================

tasklist /FI "IMAGENAME eq StatisticsAnalysisTool.exe" 2>nul | find /I "StatisticsAnalysisTool.exe" >nul 2>&1

if errorlevel 1 (
    start "" "D:\albion\tools\StatisticsAnalysisTool.exe"
)


REM ============================================================
REM ALBION TOOLS
REM ============================================================

call "%~dp0start.bat"


REM ============================================================
REM LAUNCHER CMD'YI KAPAT
REM ============================================================

exit