# ChordClicks - one-time virtual camera setup (runs elevated from Stream > Set up virtual camera).
# Installs Python 3 (if missing), the pyvirtualcam + numpy packages, and OBS Studio (which provides
# the "OBS Virtual Camera" device ChordClicks sends its preview to).
$ErrorActionPreference = 'Continue'
function Say($m) { Write-Host "`n== $m" -ForegroundColor Magenta }
Write-Host "ChordClicks virtual camera setup - Created by Riley Mackay-Poirier @506clicks"

function Find-Python {
  foreach ($c in @(@('py', '-3'), @('python'), @('python3'))) {
    try { $v = & $c[0] $c[1..9] --version 2>$null; if ($LASTEXITCODE -eq 0 -and $v -match 'Python 3') { return ,$c } } catch {}
  }
  return $null
}
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

Say 'Checking for Python 3'
$py = Find-Python
if (-not $py) {
  if (-not $hasWinget) { Write-Host 'Python 3 is missing and winget is not available. Install Python from https://www.python.org/downloads/ (tick "Add to PATH"), then run this again.' -ForegroundColor Yellow; Read-Host 'Press Enter to close'; exit 1 }
  winget install -e --id Python.Python.3.12 --scope machine --accept-package-agreements --accept-source-agreements --silent
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $py = Find-Python
  if (-not $py) { Write-Host 'Python installed but not found on PATH yet. Restart your PC, then run setup again.' -ForegroundColor Yellow; Read-Host 'Press Enter to close'; exit 1 }
}
Write-Host ("Using: " + ($py -join ' '))

Say 'Installing pyvirtualcam + numpy'
& $py[0] $py[1..9] -m pip install --upgrade pip pyvirtualcam numpy

Say 'Checking for the OBS Virtual Camera'
$obs = @("$env:ProgramFiles\obs-studio", "${env:ProgramFiles(x86)}\obs-studio") | Where-Object { Test-Path $_ }
if (-not $obs) {
  if ($hasWinget) { winget install -e --id OBSProject.OBSStudio --accept-package-agreements --accept-source-agreements --silent }
  else { Write-Host 'Install OBS Studio from https://obsproject.com (it provides the virtual camera device).' -ForegroundColor Yellow }
} else { Write-Host 'OBS Studio found.' }

Say 'Done'
Write-Host 'Restart Zoom / Discord / Teams / OBS, then press "Start virtual camera" in ChordClicks.' -ForegroundColor Green
Read-Host 'Press Enter to close'
