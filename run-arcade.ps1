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

# Test-Path has, twice, reported podman-compose.exe missing on a real
# desktop-shortcut double-click -- including for the whole 2.5s of a retry
# loop -- while the file plainly existed seconds later (right size, right
# timestamp, no OneDrive placeholder markers: not under OneDrive's synced
# tree at all, no ReparsePoint/Offline attribute, correct ACL). So Test-Path
# is logged here for diagnosis but no longer trusted as a hard gate --
# whether each tool actually works is decided below, by trying to run it.
Write-Host "APPDATA = $env:APPDATA"
foreach ($tool in @($podman, $podmanCompose, $npmCmd, $npxCmd)) {
    Write-Host "Test-Path $tool -> $(Test-Path $tool)"
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
# Tracked explicitly rather than trusting $LASTEXITCODE alone: if the call
# below throws before podman-compose ever actually runs (e.g. the absolute
# path genuinely doesn't resolve in this process), $LASTEXITCODE would still
# hold whatever the previous command (podman machine list, above) left it
# at -- which is 0 on success, and would be silently read as "it worked."
$ok = $true
try {
    & $podmanCompose --podman-path $podman up -d
    if ($LASTEXITCODE -ne 0) { $ok = $false }
} catch {
    Write-Host $_
    $ok = $false
}
if (-not $ok) {
    Fail "Could not start Postgres via podman-compose. See $logPath for the exact error."
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
    $ok = $true
    try {
        & $npmCmd run build
        if ($LASTEXITCODE -ne 0) { $ok = $false }
    } catch {
        Write-Host $_
        $ok = $false
    }
    if (-not $ok) {
        Fail "Build failed. See $logPath for the exact error."
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
