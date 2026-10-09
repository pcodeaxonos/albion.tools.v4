$ErrorActionPreference = 'Stop'

# Only one watcher is needed when the launcher is run more than once.
$watcherMutex = New-Object System.Threading.Mutex($false, 'Local\AlbionToolsHideADC')
if (-not $watcherMutex.WaitOne(0)) {
    $watcherMutex.Dispose()
    exit
}

try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlbionClientWindow {
    public delegate bool WindowCallback(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] public static extern bool EnumWindows(WindowCallback callback, IntPtr state);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
}
'@

    # Track ownership rather than a title/class that ADC can change.
    # Keep watching until ADC exits, including windows created after startup.
    while ($clients = @(Get-Process -Name 'albiondata-client' -ErrorAction SilentlyContinue)) {
        $clientIds = @($clients | ForEach-Object { $_.Id })
        [AlbionClientWindow]::EnumWindows({
            param($window, $state)
            [uint32]$ownerId = 0
            [void][AlbionClientWindow]::GetWindowThreadProcessId($window, [ref]$ownerId)
            if ($clientIds -contains $ownerId) {
                $style = [AlbionClientWindow]::GetWindowLongPtr($window, -20).ToInt64()
                $hiddenStyle = ($style -bor 0x80) -band (-bnot 0x40000)
                if ($style -ne $hiddenStyle -or [AlbionClientWindow]::IsWindowVisible($window)) {
                    [void][AlbionClientWindow]::ShowWindow($window, 0)
                    [void][AlbionClientWindow]::SetWindowLongPtr($window, -20, [IntPtr]$hiddenStyle)
                    [void][AlbionClientWindow]::SetWindowPos($window, [IntPtr]::Zero, 0, 0, 0, 0, 0x37)
                }
            }
            return $true
        }, [IntPtr]::Zero)
        Start-Sleep -Seconds 1
    }
} finally {
    $watcherMutex.ReleaseMutex()
    $watcherMutex.Dispose()
}
