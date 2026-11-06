param()

$reset = $false
$expoArgs = @()
foreach ($arg in $args) {
  if ($arg -eq "-Reset") {
    $reset = $true
  } else {
    $expoArgs += $arg
  }
}

# Windows: sem isso o Metro escuta só em ::1 e o adb reverse (IPv4) não alcança.
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

adb reverse tcp:8081 tcp:8081
if ($LASTEXITCODE -ne 0) {
  Write-Error "adb reverse falhou. Conecte o celular com depuracao USB e confira 'adb devices'."
  exit $LASTEXITCODE
}

# O reverse some quando o USB reconecta. Sem ele o app nao alcanca o Metro em 127.0.0.1:8081.
$watcher = Start-Process -FilePath "powershell" `
  -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","./scripts/keep-metro-reverse.ps1" `
  -WindowStyle Hidden -PassThru

if ($reset) {
  adb shell am force-stop com.escutaalertas.app
}

try {
  & npx expo start --dev-client --localhost --android @expoArgs
  exit $LASTEXITCODE
} finally {
  if ($watcher -and -not $watcher.HasExited) {
    Stop-Process -Id $watcher.Id -Force
  }
}
