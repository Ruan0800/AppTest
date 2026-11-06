$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { exit 1 }

while ($true) {
  $listed = & $adb reverse --list 2>&1 | Out-String
  if ($listed -notmatch "tcp:8081\s+tcp:8081") {
    & $adb reverse tcp:8081 tcp:8081 | Out-Null
  }
  Start-Sleep -Seconds 3
}
