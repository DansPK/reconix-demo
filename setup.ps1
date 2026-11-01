# Unified launcher for the Reconix demo (Windows / PowerShell). One subcommand per surface.
# The bash equivalent is setup.sh; this mirrors it for Windows.
#
#   .\setup.ps1 tui      the terminal TUI            (interactive; or 'reconix' in the venv)
#   .\setup.ps1 web      the web dashboard           http://127.0.0.1:3100
#   .\setup.ps1 site     the public website          http://localhost:3000
#   .\setup.ps1 store    the Lumina storefront       http://localhost:5173
#   .\setup.ps1 scanner  the VS Code scanner server  http://127.0.0.1:7357 (token test-token)
#   .\setup.ps1 vscode   build + install the VS Code extension
#   .\setup.ps1 reset    restore the Lumina storefront from apps\lumina-site.zip (after a fix demo)
#
# The TUI, web, site and scanner each take over a terminal, so run them in separate terminals.
# Everything runs locally on bundled sample data - no accounts, no keys.
# If scripts are blocked, run once:  Set-ExecutionPolicy -Scope Process Bypass
[CmdletBinding()]
param([string]$Command = "")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tui  = Join-Path $Root "apps\terminal"
$Ext  = Join-Path $Root "apps\scanner\extension"
$Site = Join-Path $Root "apps\public-web"

function Usage {
    # Print the leading comment block (minus the title line), stopping at the first code line.
    foreach ($l in (Get-Content $PSCommandPath | Select-Object -Skip 1)) {
        if ($l -notmatch '^#') { break }
        $l -replace '^# ?', ''
    }
}

# The storefront (the scan target; planted vulns in apps\lumina-site\server) is gitignored because
# the VS Code demo edits it when you "Fix" a finding. The pristine copy is the tracked
# apps\lumina-site.zip; extract it on a fresh clone, and '.\setup.ps1 reset' re-extracts on demand.
$ScanTarget = Join-Path $Root "apps\lumina-site"
$LuminaZip  = Join-Path $Root "apps\lumina-site.zip"

function Ensure-Store {
    if ((Test-Path $ScanTarget) -or -not (Test-Path $LuminaZip)) { return }
    Write-Host "Extracting the Lumina storefront (apps\lumina-site)..."
    Expand-Archive -Path $LuminaZip -DestinationPath (Join-Path $Root "apps") -Force
}

function Need-NodeModules($dir) {
    if (-not (Test-Path (Join-Path $dir "node_modules"))) {
        Push-Location $dir; try { npm install } finally { Pop-Location }
    }
}

function Invoke-Vscode {
    # Build, package and install the extension, then point VS Code at the bundled server.
    $serverUrl = "http://127.0.0.1:7357"
    $token = "test-token"
    Push-Location $Ext
    try {
        Write-Host "`n==> Building the VS Code extension"
        npm ci --no-audit --no-fund --loglevel=error
        npm run build --silent
        npx -y @vscode/vsce package --allow-missing-repository --skip-license -o reconix-scanner.vsix | Out-Null
        Write-Host "Packaged $Ext\reconix-scanner.vsix"

        if (Get-Command code -ErrorAction SilentlyContinue) {
            Write-Host "`n==> Installing the extension and configuring VS Code"
            code --install-extension reconix-scanner.vsix --force | Out-Null
            $settings = Join-Path $env:APPDATA "Code\User\settings.json"
            if (Update-CodeSettings $settings $serverUrl $token) {
                Write-Host "VS Code settings updated (serverUrl=$serverUrl, token set)"
            } else {
                Write-Warning "Could not edit $settings. Set reconix.serverUrl=$serverUrl and token=$token yourself."
            }
        } else {
            Write-Warning "'code' is not on PATH. Install $Ext\reconix-scanner.vsix from VS Code (Extensions -> ... -> Install from VSIX)."
        }
    } finally { Pop-Location }

    Write-Host "`n==> Done"
    Write-Host "Scanner server: $serverUrl  (token: $token)"
    Write-Host "Start it:       .\setup.ps1 scanner"
    Write-Host "Scan target:    open apps\lumina-site\ in VS Code (planted issues in apps\lumina-site\server)"
    Write-Host 'Then in VS Code: Reload Window -> shield icon -> "Scan with Reconix".'

    # Open the storefront as its OWN window so the scan sees its source, including the planted
    # vulnerable backend in apps\lumina-site\server.
    if (Get-Command code -ErrorAction SilentlyContinue) {
        Write-Host "Opening apps\lumina-site in VS Code (scan from this window)..."
        code $ScanTarget
    }
}

function Update-CodeSettings($path, $url, $token) {
    try {
        New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
        $obj = $null
        if ((Test-Path $path) -and (Get-Item $path).Length -gt 0) {
            # ConvertFrom-Json rejects comments/trailing commas; leave such files alone.
            $obj = Get-Content -Raw -Path $path | ConvertFrom-Json
        }
        if (-not $obj) { $obj = [pscustomobject]@{} }
        # Migrate keys from older installs (vulnScanner.* -> reconix.*).
        foreach ($p in @($obj.PSObject.Properties | Where-Object { $_.Name -like "vulnScanner.*" })) {
            $new = "reconix." + $p.Name.Substring("vulnScanner.".Length)
            if (-not $obj.PSObject.Properties[$new]) { $obj | Add-Member -NotePropertyName $new -NotePropertyValue $p.Value }
            $obj.PSObject.Properties.Remove($p.Name)
        }
        $obj | Add-Member -NotePropertyName "reconix.serverUrl" -NotePropertyValue $url -Force
        $obj | Add-Member -NotePropertyName "reconix.token" -NotePropertyValue $token -Force
        $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $path -Encoding UTF8
        return $true
    } catch { return $false }
}

switch ($Command) {
    { $_ -in "store","scanner","vscode","setup" } { Ensure-Store }
}

switch ($Command) {
    "tui" {
        $py = Join-Path $Tui ".venv\Scripts\python.exe"
        if (-not (Test-Path $py)) {
            Write-Host "Creating venv..."
            python -m venv (Join-Path $Tui ".venv")
            & $py -m pip install -q -e $Tui
        }
        # The editable install also exposes a `reconix` command inside the venv; the hint below
        # prints after you quit the full-screen TUI.
        & $py -m reconix
        $activate = Join-Path $Tui ".venv\Scripts\Activate.ps1"
        Write-Host "Tip: you can launch the TUI by name - activate the venv first, then run 'reconix':"
        Write-Host "       . `"$activate`"; reconix"
        break
    }
    "web"     { Need-NodeModules (Join-Path $Tui "web"); Push-Location (Join-Path $Tui "web"); npm run dev; break }
    "site"    { Need-NodeModules $Site; Push-Location $Site; npm run dev; break }
    "store"   { Need-NodeModules $ScanTarget; Push-Location $ScanTarget; npm run dev; break }
    "scanner" { Need-NodeModules $Ext;  Push-Location $Ext;  npm run server; break }
    { $_ -in "vscode","setup" } { Invoke-Vscode; break }
    { $_ -in "reset","reset-lumina" } {
        # Restore the storefront from the pristine zip after a "Fix" + rescan demo (overwrites
        # source files in place; node_modules, which isn't in the zip, is left alone).
        if (-not (Test-Path $LuminaZip)) { Write-Error "setup.ps1: missing apps\lumina-site.zip"; exit 1 }
        Expand-Archive -Path $LuminaZip -DestinationPath (Join-Path $Root "apps") -Force
        Write-Host "Lumina storefront reset to its original sources (apps\lumina-site)."
        Write-Host "Re-run the scan to see all findings again."
        break
    }
    { $_ -in "","-h","--help","help" } { Usage; break }
    default { Write-Error "setup.ps1: unknown command '$Command'"; Write-Host ""; Usage; exit 1 }
}
