param(
  [string]$PackageName = "com.lafina",
  [int]$DurationSeconds = 45,
  [string]$OutputPath = "call-profile.csv"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw "adb was not found. Install Android platform-tools and add adb to PATH."
}

$devices = adb devices | Select-String "`tdevice$"
if (-not $devices) {
  throw "No authorized Android device is connected."
}

$pidText = (adb shell pidof $PackageName).Trim()
if (-not $pidText) {
  throw "$PackageName is not running. Open LAFINA and trigger a reminder call first."
}
$processId = ($pidText -split "\s+")[0]

"timestamp_utc,elapsed_seconds,pid,total_pss_kb,cpu_percent" | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Host "Profiling $PackageName (PID $processId) for $DurationSeconds seconds..."

for ($elapsed = 0; $elapsed -lt $DurationSeconds; $elapsed++) {
  $memInfo = adb shell dumpsys meminfo $processId
  $totalLine = $memInfo | Select-String "TOTAL PSS:" | Select-Object -First 1
  $totalPssKb = if ($totalLine -and $totalLine.Line -match "TOTAL PSS:\s+(\d+)") { $Matches[1] } else { "" }

  $cpuInfo = adb shell dumpsys cpuinfo
  $cpuLine = $cpuInfo | Select-String "$PackageName" | Select-Object -First 1
  $cpuPercent = if ($cpuLine -and $cpuLine.Line -match "^\s*([0-9.]+)%") {
    $Matches[1]
  } else {
    $topInfo = adb shell top -b -n 1 -p $processId
    $topLine = $topInfo | Select-String "\s$([regex]::Escape($PackageName))$" | Select-Object -First 1
    if ($topLine -and $topLine.Line -match "\s([0-9.]+)\s+[0-9.]+\s+[0-9:]+(?:\.[0-9]+)?\s+$([regex]::Escape($PackageName))$") {
      $Matches[1]
    } else {
      ""
    }
  }

  $timestamp = [DateTime]::UtcNow.ToString("o")
  "$timestamp,$elapsed,$processId,$totalPssKb,$cpuPercent" | Add-Content -LiteralPath $OutputPath -Encoding utf8
  Start-Sleep -Seconds 1
}

Write-Host "Profile saved to $((Resolve-Path $OutputPath).Path)"