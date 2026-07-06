# Bilanço Analiz — başlatıcı (Windows)
# Node'u bulur, yerel köprü sunucusunu başlatır ve uygulamayı Chrome'da açar.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Node bul: PATH'te node → yaygın konumlar
$node = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }
if (-not $node) {
  $cands = @(
    "$dir\node\node.exe",
    "$env:LOCALAPPDATA\node-portable\node-v24.17.0-win-x64\node.exe",
    "$env:ProgramFiles\nodejs\node.exe"
  )
  $node = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $node) {
  Write-Host "HATA: Node.js bulunamadi. https://nodejs.org adresinden kurun." -ForegroundColor Red
  Start-Sleep -Seconds 8; exit
}

$alive = Get-NetTCPConnection -LocalPort 8723 -State Listen -ErrorAction SilentlyContinue
if (-not $alive) {
  Write-Host "Sunucu baslatiliyor..."
  Start-Process -FilePath $node -ArgumentList "`"$dir\server.js`"" -WorkingDirectory $dir
}
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 300
  if (Get-NetTCPConnection -LocalPort 8723 -State Listen -ErrorAction SilentlyContinue) { break }
}

# Chrome'da aç (yoksa varsayılan tarayıcı)
$chromeCands = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCands | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Start-Process $chrome "http://localhost:8723/" } else { Start-Process "http://localhost:8723/" }
Write-Host "Uygulama tarayicida acildi: http://localhost:8723/"
Write-Host "Durdurmak icin acilan 'node' penceresini kapatin."
