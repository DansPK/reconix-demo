# Unified launcher for the Reconix demo (Windows / PowerShell). One subcommand per surface.
# The bash equivalent is setup.sh; this mirrors it for Windows.
#
#   .\setup.ps1 tui      the terminal TUI            (interactive)
#   .\setup.ps1 web      the web dashboard           http://127.0.0.1:3100
#   .\setup.ps1 site     the public website          http://localhost:3000
#   .\setup.ps1 scanner  the VS Code scanner server  http://127.0.0.1:7357 (token test-token)
#   .\setup.ps1 vscode   build + install the VS Code extension
#   .\setup.ps1 reset    restore the Lumina sample app to its original vulnerable state
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

# apps\Lumina is gitignored (edited during demos); on a fresh clone it is missing,
# so extract the tracked pristine copy. '.\setup.ps1 reset' re-extracts it on demand.
function Ensure-Lumina {
    $dir = Join-Path $Root "apps\Lumina"
    $zip = Join-Path $Root "apps\lumina.zip"
    if ((Test-Path $dir) -or -not (Test-Path $zip)) { return }
    Write-Host "Extracting the Lumina sample app (apps\Lumina)..."
    Expand-Archive -Path $zip -DestinationPath (Join-Path $Root "apps") -Force
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
    Write-Host "Sample app:     open apps\Lumina\ in VS Code (one issue per file)"
    Write-Host 'Then in VS Code: Reload Window -> shield icon -> "Scan with Reconix".'

    # Open Lumina as its OWN window. apps\Lumina is gitignored and the scanner honours
    # .gitignore, so scanning the repo-root window would skip it (no findings).
    if (Get-Command code -ErrorAction SilentlyContinue) {
        Write-Host "Opening apps\Lumina in VS Code (scan from this window)..."
        code (Join-Path $Root "apps\Lumina")
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
    { $_ -in "tui","web","site","scanner","vscode","setup" } { Ensure-Lumina }
}

switch ($Command) {
    "tui" {
        $py = Join-Path $Tui ".venv\Scripts\python.exe"
        if (-not (Test-Path $py)) {
            Write-Host "Creating venv..."
            python -m venv (Join-Path $Tui ".venv")
            & $py -m pip install -q -e $Tui
        }
        & $py -m reconix
        break
    }
    "web"     { Need-NodeModules (Join-Path $Tui "web"); Push-Location (Join-Path $Tui "web"); npm run dev; break }
    "site"    { Need-NodeModules $Site; Push-Location $Site; npm run dev; break }
    "scanner" { Need-NodeModules $Ext;  Push-Location $Ext;  npm run server; break }
    { $_ -in "vscode","setup" } { Invoke-Vscode; break }
    { $_ -in "reset","reset-lumina" } {
        $zip = Join-Path $Root "apps\lumina.zip"
        if (-not (Test-Path $zip)) { Write-Error "setup.ps1: missing apps\lumina.zip"; exit 1 }
        $dir = Join-Path $Root "apps\Lumina"
        if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
        Expand-Archive -Path $zip -DestinationPath (Join-Path $Root "apps") -Force
        Write-Host "Lumina reset to the original vulnerable sources (apps\Lumina)."
        Write-Host "Re-run the scan to see all findings again."
        break
    }
    { $_ -in "","-h","--help","help" } { Usage; break }
    default { Write-Error "setup.ps1: unknown command '$Command'"; Write-Host ""; Usage; exit 1 }
}
