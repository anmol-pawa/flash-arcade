#Requires -Version 5.1
# Launcher for the Flash Arcade desktop shortcut. Rewritten from a batch script
# after two path-resolution theories both failed to fix a real double-click
# (see CLAUDE.md items 15-16 for the history). This version avoids PATH search
# entirely -- every tool is invoked by an absolute, existence-checked path --
# and logs everything to run-arcade.log so a future failure is diagnosable
# from the log file alone, without depending on a console transcript.

Set-Location $PSScriptRoot

$logPath = Join-Path $PSScriptRoot 'run-arcade.log'
Start-Transcript -Path $logPath -Force | Out-Null

function Fail($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    Write-Host "Full details were logged to: $logPath"
    Stop-Transcript | Out-Null
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "================================"
Write-Host "  Flash Arcade"
Write-Host "================================"
Write-Host ""

$podman = "C:\Program Files\RedHat\Podman\podman.exe"
$podmanCompose = Join-Path $env:APPDATA "Python\Python313\Scripts\podman-compose.exe"
$npmCmd = "C:\Program Files\nodejs\npm.cmd"
$npxCmd = "C:\Program Files\nodejs\npx.cmd"

# A real desktop-shortcut double-click has, once, seen Test-Path report a
# file missing that plainly exists (confirmed seconds later from a normal
# shell) -- most likely OneDrive, antivirus, or disk I/O momentarily holding
# the file right when the process starts. Retry before treating it as a
# real failure; only fail if it's still missing after several attempts.
foreach ($tool in @(
    @{ Path = $podman; Name = "Podman"; Install = "https://podman.io" },
    @{ Path = $podmanCompose; Name = "podman-compose"; Install = "pip install --user podman-compose" },
    @{ Path = $npmCmd; Name = "npm"; Install = "https://nodejs.org" },
    @{ Path = $npxCmd; Name = "npx"; Install = "https://nodejs.org" }
)) {
    $found = $false
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        if (Test-Path $tool.Path) { $found = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $found) {
        Fail "$($tool.Name) not found at $($tool.Path) after retrying for 2.5s.`nInstall it: $($tool.Install)`nOr update the path in run-arcade.ps1 if it's installed elsewhere."
    }
}

# Every tool above is invoked by absolute path, but several of them do their
# OWN bare-name subprocess lookups internally: podman-compose shells out to
# "podman", and npm.cmd/npx.cmd shell out to "node" -- both by name, not by
# path, regardless of how *this* script invokes them. This only ever broke
# on a real desktop-shortcut double-click, which inherits explorer.exe's own
# copy of PATH -- cached whenever explorer last started, potentially long
# before any of these were installed. Fixing PATH here, in this process,
# covers those internal lookups too, on top of the absolute paths above.
$env:Path = "$(Split-Path $podman);$(Split-Path $podmanCompose);$(Split-Path $npmCmd);$env:Path"

Write-Host "Starting Podman machine (if needed)..."
# `machine start` writes to stderr and exits non-zero when the machine is
# already running (some versions treat that as an error, not a no-op), so
# this is wrapped rather than left to abort the script -- checking actual
# machine state afterward is what actually decides success or failure.
try { & $podman machine start } catch { Write-Host $_ }
$machine = (& $podman machine list --format json | ConvertFrom-Json) | Where-Object { $_.Name -eq 'podman-machine-default' }
if (-not $machine -or -not $machine.Running) {
    Fail "The Podman machine did not start. Run 'podman machine start' in a terminal to see the real error."
}

Write-Host "Starting Postgres (Podman)..."
try { & $podmanCompose --podman-path $podman up -d } catch { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
    Fail "Could not start Postgres via podman-compose (exit code $LASTEXITCODE)."
}

Write-Host "Waiting for Postgres to be healthy..."
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    $status = & $podman inspect --format "{{.State.Health.Status}}" flash-arcade-db 2>$null
    if ($status -eq 'healthy') { $healthy = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Fail "Postgres did not become healthy within 2 minutes."
}
Write-Host "Postgres is ready."
Write-Host ""

# If the app is already running elsewhere, just open the browser rather than
# trying to start a second server on the same port.
try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3003/' -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
        Write-Host "Flash Arcade is already running."
        Start-Process 'http://localhost:3003'
        Stop-Transcript | Out-Null
        exit 0
    }
} catch {
    # Not running yet -- fall through and start it.
}

if (-not (Test-Path ".next\BUILD_ID")) {
    Write-Host "No production build found -- building now, this can take a minute..."
    try { & $npmCmd run build } catch { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Fail "Build failed (exit code $LASTEXITCODE)."
    }
}

# Open the browser a few seconds after the server starts, from a background
# job, while this window runs the server itself in the foreground. Closing
# this window stops the server -- that is deliberate, so there is one
# obvious way to shut the arcade down.
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process 'http://localhost:3003'
} | Out-Null

Write-Host "Starting the server on http://localhost:3003"
Write-Host "Close this window to stop Flash Arcade."
Write-Host ""
Stop-Transcript | Out-Null
& $npxCmd next start -p 3003

Write-Host ""
Write-Host "Flash Arcade has stopped."
Read-Host "Press Enter to exit"
