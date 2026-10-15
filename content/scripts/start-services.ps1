$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location -LiteralPath $projectRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
if ($env:ALBION_NODE) { $nodePath = $env:ALBION_NODE }
elseif (Test-Path -LiteralPath '.albion-node.path') { $nodePath = (Get-Content -LiteralPath '.albion-node.path' -Raw).Trim() }
& $nodePath -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.16+ gerekli.' }
$logDirectory = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$tradePort = & $nodePath --input-type=module -e "import {TRADE_HUB_PORT} from './content/js/core/trade-config.mjs'; console.log(process.env.TRADE_HUB_PORT || TRADE_HUB_PORT)"
if ($LASTEXITCODE -ne 0) { throw 'Trade Hub portu okunamadi.' }
$webPort = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$pricePort = if ($env:PRICE_HUB_PORT) { [int]$env:PRICE_HUB_PORT } else { 3001 }
$services = @(
    @{ Name = 'serve'; Script = 'serve.mjs'; Port = $webPort; Path = '/' },
    @{ Name = 'prices'; Script = 'price-hub.mjs'; Port = $pricePort; Path = '/api/v1/user-data' },
    @{ Name = 'trades'; Script = 'trade-hub.mjs'; Port = [int]$tradePort; Path = '/api/v1/trades/status' }
)
function Test-ServiceReady($service) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$($service.Port)$($service.Path)" -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}
foreach ($service in $services) {
    if (Test-ServiceReady $service) { continue }
    $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue
    if ($listener) { throw "$($service.Name): port $($service.Port) kullanimda ancak servis hazir degil. logs klasorunu kontrol edin." }
    $scriptPath = Join-Path $PSScriptRoot $service.Script
    Start-Process -FilePath $nodePath -ArgumentList ('"' + $scriptPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory "$($service.Name).log") -RedirectStandardError (Join-Path $logDirectory "$($service.Name)-error.log") | Out-Null
}
$deadline = (Get-Date).AddSeconds(45)
do {
    $pending = @($services | Where-Object { -not (Test-ServiceReady $_) })
    if ($pending.Count -eq 0) { Write-Host 'Web, veritabani ve Trade Hub hazir.'; exit 0 }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
throw "Servisler hazir olmadi: $($pending.Name -join ', '). logs klasorundeki hata dosyalarini kontrol edin."
