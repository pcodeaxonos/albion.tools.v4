param([Parameter(Mandatory = $true)][int]$HubProcessId)
$ErrorActionPreference = 'Stop'
$hubProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $HubProcessId"
if (!$hubProcess -or $hubProcess.CommandLine -notmatch 'content[/\\]scripts[/\\]price-hub\.mjs') {
    throw 'The target is not the requested price hub.'
}
$listeners = @(Get-NetTCPConnection -LocalPort 3001 -State Listen)
if (!$listeners.Count -or @($listeners | Where-Object OwningProcess -ne $HubProcessId).Count) {
    throw 'Port 3001 is not exclusively owned by the target.'
}
$status = Invoke-RestMethod 'http://127.0.0.1:3001/api/v2/stats/status' -TimeoutSec 10
if ($status.collector.status -eq 'collecting' -or
    ([DateTimeOffset]::Parse($status.collector.nextRunAt) - [DateTimeOffset]::UtcNow).TotalSeconds -lt 10) {
    throw 'Collector is active or its next run is imminent; no signal sent.'
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class IsolatedHubConsole {
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetConsoleProcessList(uint[] list, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint signal, uint group);
    public static void Signal(uint target) {
        FreeConsole();
        if (!AttachConsole(target)) throw new Exception("No accessible hub console; no signal sent.");
        try {
            uint[] list = new uint[64];
            uint count = GetConsoleProcessList(list, (uint)list.Length);
            uint helper = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
            if (count == 0 || count > list.Length) throw new Exception("Cannot establish exclusive console ownership; no signal sent.");
            bool found = false;
            for (int i=0; i<count; i++) {
                if (list[i] == target) found = true;
                else if (list[i] != helper) throw new Exception("Console is shared with another process; no signal sent.");
            }
            if (!found) throw new Exception("Target is absent from its console; no signal sent.");
            if (!SetConsoleCtrlHandler(IntPtr.Zero, true)) throw new Exception("Cannot protect helper; no signal sent.");
            if (!GenerateConsoleCtrlEvent(0, 0)) throw new Exception("CTRL+C dispatch failed.");
            System.Threading.Thread.Sleep(300);
        } finally { FreeConsole(); }
    }
}
'@
[IsolatedHubConsole]::Signal([uint32]$HubProcessId)
Write-Output 'Graceful CTRL+C sent only to the isolated price hub console.'
