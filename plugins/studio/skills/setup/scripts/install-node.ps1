# Animation Room Studio: installs a private copy of Node.js (latest LTS) into the studio's data folder.
# Nothing outside that folder changes, and no administrator rights are needed.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File install-node.ps1 <data_dir>
param([Parameter(Mandatory = $true)][string]$DataDir)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Dist = "https://nodejs.org/dist"

$arch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
$a = switch ($arch) { "ARM64" { "arm64" } "AMD64" { "x64" } default { "" } }
if (-not $a) { Write-Output "NODE_INSTALL=failed"; Write-Output "REASON=unsupported chip $arch"; exit 1 }

try {
  $tab = (Invoke-WebRequest -Uri "$Dist/index.tab" -UseBasicParsing -TimeoutSec 30).Content -split "`n"
  $version = ""
  foreach ($line in ($tab | Select-Object -Skip 1)) {
    $c = $line -split "`t"
    if ($c.Length -ge 10 -and $c[9] -ne "-" -and $c[2] -like "*win-$a-zip*") { $version = $c[0]; break }
  }
  # If the list cannot be read, use a known good LTS release instead of giving up.
  if (-not $version) { $version = "v22.14.0"; [Console]::Error.WriteLine("Could not read the Node.js release list, using $version.") }

  $name = "node-$version-win-$a"
  $zip = "$name.zip"
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("animationroom-node-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  [Console]::Error.WriteLine("Downloading Node.js $version for Windows $a...")
  Invoke-WebRequest -Uri "$Dist/$version/$zip" -OutFile (Join-Path $tmp $zip) -UseBasicParsing -TimeoutSec 600
  $sums = (Invoke-WebRequest -Uri "$Dist/$version/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 60).Content -split "`n"
  $expected = ($sums | Where-Object { $_ -match "\s$([regex]::Escape($zip))$" } | ForEach-Object { ($_ -split "\s+")[0] }) | Select-Object -First 1
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $zip)).Hash.ToLower()
  if (-not $expected -or $expected.ToLower() -ne $actual) { throw "download check failed, the file did not match its checksum" }

  Expand-Archive -Path (Join-Path $tmp $zip) -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
  $dest = Join-Path $DataDir "node"
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Move-Item (Join-Path $tmp $name) $dest
  Remove-Item $tmp -Recurse -Force

  Write-Output "NODE_INSTALL=ok"
  Write-Output "NODE_PRIVATE=$(Join-Path $dest 'node.exe')"
  Write-Output "NODE_PRIVATE_VERSION=$(& (Join-Path $dest 'node.exe') -v)"
} catch {
  Write-Output "NODE_INSTALL=failed"
  Write-Output "REASON=$($_.Exception.Message)"
  exit 1
}
