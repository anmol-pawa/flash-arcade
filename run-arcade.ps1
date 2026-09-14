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
$npmCmd = "C:\Program Files\nodejs\npm.cmd"
$npxCmd = "C:\Program Files\nodejs\npx.cmd"

# Test-Path has, on a real desktop-shortcut double-click, three times
# reported one of these tools missing at its correct, existence-verified
# path -- always podman-compose.exe specifically, never podman.exe/npm/npx,
# and never reproducible from any interactive test. So Test-Path is logged
# here for diagnosis but no longer trusted as a hard gate -- whether each
# tool actually works is decided below, by trying to run it.
Write-Host "APPDATA = $env:APPDATA"
foreach ($tool in @($podman, $npmCmd, $npxCmd)) {
    Write-Host "Test-Path $tool -> $(Test-Path $tool)"
}

# Every tool above is invoked by absolute path, but npm.cmd/npx.cmd do their
# OWN bare-name subprocess lookup internally -- they shell out to "node" by
# name, not by path, regardless of how *this* script invokes them. This only
# ever broke on a real desktop-shortcut double-click, which inherits
# explorer.exe's own copy of PATH -- cached whenever explorer last started,
# potentially long before Node was installed. Fixing PATH here, in this
# process, covers that internal lookup too, on top of the absolute paths.
$env:Path = "$(Split-Path $podman);$(Split-Path $npmCmd);$env:Path"

# flash-arcade runs on its own dedicated Podman machine, not the shared
# podman-machine-default that stackcraft's containers live on -- stopping
# the shared machine once took all of stackcraft down with it (see
# CLAUDE.md item 12). The machine must be rootful: two systemd-enabled WSL
# machines under the same UID (1000) collide on user@1000.service ("Device
# or resource busy" -- containers/podman#27831), which breaks the second
# machine's rootless API socket entirely, no matter how it's started.
# Rootful mode uses a system-level socket instead, sidestepping that
# collision. CONTAINER_CONNECTION routes every podman call below to this
# machine without changing the system default (which stays
# podman-machine-default, so stackcraft's own tooling is unaffected).
$env:CONTAINER_CONNECTION = "flash-arcade-root"

Write-Host "Starting Podman machine (if needed)..."
# `machine start` writes to stderr and exits non-zero when the machine is
# already running (some versions treat that as an error, not a no-op), so
# this is wrapped rather than left to abort the script -- checking actual
# machine state afterward is what actually decides success or failure.
try { & $podman machine start flash-arcade } catch { Write-Host $_ }
$machine = (& $podman machine list --format json | ConvertFrom-Json) | Where-Object { $_.Name -eq 'flash-arcade' }
if (-not $machine -or -not $machine.Running) {
    Fail "The flash-arcade Podman machine did not start. Run 'podman machine start flash-arcade' in a terminal to see the real error."
}

Write-Host "Starting Postgres (Podman)..."
# Calls podman directly rather than through podman-compose: podman-compose
# is what failed on a real double-click, three separate times, always this
# one file, never reproducible under any interactive test -- Test-Path and
# the real invocation both failing point to something about how Explorer
# spawns this process specifically, not a bug fixable from inside the
# script. podman.exe itself has never once failed to resolve, so this
# replicates docker-compose.yml's single service by hand instead of
# depending on the compose tool at all -- one less moving part, and the
# part that was actually breaking.
$ok = $true
try {
    $existing = (& $podman ps -a --filter "name=^flash-arcade-db$" --format "{{.Names}}") -join ""
    if ($existing -eq "flash-arcade-db") {
        $running = (& $podman ps --filter "name=^flash-arcade-db$" --format "{{.Names}}") -join ""
        if ($running -ne "flash-arcade-db") {
            & $podman start flash-arcade-db
            if ($LASTEXITCODE -ne 0) { $ok = $false }
        }
    } else {
        & $podman run -d `
            --name flash-arcade-db `
            --restart unless-stopped `
            -e POSTGRES_USER=arcade `
            -e POSTGRES_PASSWORD=arcade `
            -e POSTGRES_DB=arcade `
            -e "POSTGRES_INITDB_ARGS=--locale=C --encoding=UTF8" `
            -p 5434:5432 `
            -v arcade-pgdata:/var/lib/postgresql `
            --health-cmd "pg_isready -U arcade -d arcade -q" `
            --health-interval 5s `
            --health-timeout 5s `
            --health-retries 10 `
            --health-start-period 10s `
            postgres:18-alpine
        if ($LASTEXITCODE -ne 0) { $ok = $false }
    }
} catch {
    Write-Host $_
    $ok = $false
}
if (-not $ok) {
    Fail "Could not start Postgres via podman. See $logPath for the exact error."
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

# "No build" alone isn't the right check -- a build that exists but predates
# the current source is worse, because it fails silently: the app runs, just
# on stale code, with no error to notice. That already happened once here:
# an unrelated rewrite of the shelf sync logic shipped, but .next/BUILD_ID
# from a week earlier was still present, so this script kept serving the
# old bundle, and the old bundle's behavior looked exactly like a real
# runtime bug for a while before the stale build was the thing found.
$buildIdPath = ".next\BUILD_ID"
$needsBuild = -not (Test-Path $buildIdPath)
if (-not $needsBuild) {
    $buildTime = (Get-Item $buildIdPath).LastWriteTimeUtc
    $newestSource = Get-ChildItem -Path "app", "components", "lib" -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
        Select-Object -ExpandProperty LastWriteTimeUtc |
        Measure-Object -Maximum |
        Select-Object -ExpandProperty Maximum
    foreach ($configFile in @("package.json", "next.config.ts", "tsconfig.json")) {
        if (Test-Path $configFile) {
            $configTime = (Get-Item $configFile).LastWriteTimeUtc
            if (-not $newestSource -or $configTime -gt $newestSource) { $newestSource = $configTime }
        }
    }
    if ($newestSource -and $newestSource -gt $buildTime) { $needsBuild = $true }
}

if ($needsBuild) {
    Write-Host "No up-to-date production build found -- building now, this can take a minute..."
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
