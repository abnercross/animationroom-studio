# Animation Room Studio: computer check for Windows.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File check.ps1 <plugin_root> <data_dir> [studio_dir]
# Prints KEY=value lines. Never changes anything on the computer.
param([string]$PluginRoot = "", [string]$DataDir = "", [string]$StudioDir = "")

$MinNode = 20
$MinFreeGB = 5
function Say($k, $v) { Write-Output "$k=$v" }

Say STUDIO_CHECK 1

# One studio per computer: if this chat's own data folder is still empty but a studio was set up before (the store and a
# file upload give two different folders), use that one. The scripts follow the same rule (scripts/home.mjs).
function IsStudio($d) { return [bool]($d -and ((Test-Path (Join-Path $d "config.json")) -or (Test-Path (Join-Path $d "runtime\.installed.json")))) }
if (-not (IsStudio $DataDir)) {
  $homeDir = if ($env:AR_HOME) { $env:AR_HOME } else { Join-Path $HOME ".animationroom" }
  $ptr = Join-Path $homeDir "home.json"
  if (Test-Path $ptr) {
    $known = ""
    try { $known = (Get-Content $ptr -Raw | ConvertFrom-Json).data } catch {}
    if ((IsStudio $known) -and ($known -ne $DataDir)) { Say DATA_ADOPTED $known; $DataDir = $known }
  }
}
if ($DataDir) { Say DATA_FOLDER $DataDir } else { Say DATA_FOLDER none }
if ($env:CLAUDE_CODE_REMOTE -eq "true") { Say CLOUD_SESSION yes } else { Say CLOUD_SESSION no }

Say OS windows
Say OS_VERSION ([System.Environment]::OSVersion.VersionString)
$arch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
switch ($arch) { "ARM64" { Say ARCH arm64 } "AMD64" { Say ARCH x64 } default { Say ARCH $arch } }

# Free space on the drive that holds the home folder
try {
  $drive = (Get-Item $HOME).PSDrive
  $free = [math]::Floor($drive.Free / 1GB)
  Say FREE_GB $free
  if ($free -ge $MinFreeGB) { Say DISK_OK yes } else { Say DISK_OK no }
} catch { Say FREE_GB unknown; Say DISK_OK no }

function NodeMajor($exe) {
  try { $v = & $exe -v 2>$null; if ($v -match '^v(\d+)') { return [int]$Matches[1] } } catch {}
  return 0
}
$sys = (Get-Command node -ErrorAction SilentlyContinue)
$sysNode = if ($sys) { $sys.Source } else { "" }
if ($sysNode) { Say NODE_SYSTEM $sysNode; Say NODE_SYSTEM_VERSION (& $sysNode -v) } else { Say NODE_SYSTEM none; Say NODE_SYSTEM_VERSION none }
$privNode = ""
if ($DataDir -and (Test-Path (Join-Path $DataDir "node\node.exe"))) { $privNode = (Join-Path $DataDir "node\node.exe") }
if ($privNode) { Say NODE_PRIVATE $privNode; Say NODE_PRIVATE_VERSION (& $privNode -v) } else { Say NODE_PRIVATE none; Say NODE_PRIVATE_VERSION none }
$use = ""
if ($privNode -and (NodeMajor $privNode) -ge $MinNode) { $use = $privNode; Say NODE_OK private }
elseif ($sysNode -and (NodeMajor $sysNode) -ge $MinNode) { $use = $sysNode; Say NODE_OK system }
else { Say NODE_OK no }
if ($use) { Say NODE_USE $use } else { Say NODE_USE none }

# Windows gets a ready made transcription engine, so no build tools are needed.
Say BUILD_TOOLS not_needed

function Net($url) { try { Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 8 | Out-Null; return "yes" } catch { return "no" } }
Say NET_NPM (Net "https://registry.npmjs.org/")
Say NET_NODEJS (Net "https://nodejs.org/dist/index.tab")

$inst = if ($DataDir) { Join-Path $DataDir "runtime\.installed.json" } else { "" }
if ($inst -and (Test-Path $inst)) {
  $have = (Get-Content $inst -Raw | ConvertFrom-Json).version
  $want = ""
  try { $want = (Get-Content (Join-Path $PluginRoot "runtime\package.json") -Raw | ConvertFrom-Json).version } catch {}
  if ($want -and ($have -ne $want)) { Say RUNTIME outdated } else { Say RUNTIME installed }
  Say RUNTIME_VERSION $have
} else { Say RUNTIME missing }
# The Edit engine is separate from the Animate engine.
$einst = if ($DataDir) { Join-Path $DataDir "runtime-edit\.installed.json" } else { "" }
if ($einst -and (Test-Path $einst)) {
  $ehave = (Get-Content $einst -Raw | ConvertFrom-Json).version
  $ewant = ""
  try { $ewant = (Get-Content (Join-Path $PluginRoot "edit-runtime\package.json") -Raw | ConvertFrom-Json).version } catch {}
  if ($ewant -and ($ehave -ne $ewant)) { Say EDIT_RUNTIME outdated } else { Say EDIT_RUNTIME installed }
} else { Say EDIT_RUNTIME missing }
# The install step writes .installed.json only after the video browser is in place.
if ($inst -and (Test-Path $inst) -and ((Get-Content $inst -Raw) -match '"browser"')) { Say BROWSER ready } else { Say BROWSER missing }
if ($DataDir -and (Test-Path (Join-Path $DataDir "whisper\.ready"))) { Say TRANSCRIBER ready } else { Say TRANSCRIBER missing }

$cfg = if ($DataDir) { Join-Path $DataDir "config.json" } else { "" }
if ($cfg -and (Test-Path $cfg)) {
  Say CONFIG present
  if ((Get-Content $cfg -Raw) -match '"license"') { Say LICENSE present } else { Say LICENSE missing }
} else { Say CONFIG missing; Say LICENSE missing }

# Where videos will live. The Videos folder is often moved into OneDrive, so check for that.
if (-not $StudioDir) {
  $videos = [Environment]::GetFolderPath("MyVideos")
  if ($env:OneDrive -and $videos.StartsWith($env:OneDrive, [StringComparison]::OrdinalIgnoreCase)) { $StudioDir = Join-Path $HOME "Animation Room" }
  else { $StudioDir = Join-Path $videos "Animation Room" }
}
Say STUDIO_DIR $StudioDir
$sync = "no"
if ($env:OneDrive -and $StudioDir.StartsWith($env:OneDrive, [StringComparison]::OrdinalIgnoreCase)) { $sync = "onedrive" }
elseif ($StudioDir -match 'OneDrive') { $sync = "onedrive" }
elseif ($StudioDir -match 'Dropbox') { $sync = "dropbox" }
elseif ($StudioDir -match 'Google Drive|My Drive') { $sync = "googledrive" }
elseif ($StudioDir -match 'iCloudDrive') { $sync = "icloud" }
Say STUDIO_DIR_SYNCED $sync
if (Test-Path $StudioDir) { Say STUDIO_DIR_EXISTS yes } else { Say STUDIO_DIR_EXISTS no }

# One plain verdict, so nobody has to work it out from the lines above.
# Animate needs: Node, the animation engine, the video browser, the license. Edit needs the editing engine instead.
# An outdated engine is fine: the Animate and Edit scripts update it by themselves when they need it.
$base = $true; $missing = @()
if (-not $use) { $base = $false; $missing += "node" }
$licensed = $cfg -and (Test-Path $cfg) -and ((Get-Content $cfg -Raw) -match '"license"')
if (-not $licensed) { $base = $false; $missing += "license" }
$hasBrowser = $inst -and (Test-Path $inst) -and ((Get-Content $inst -Raw) -match '"browser"')
if (-not $hasBrowser) { $base = $false; $missing += "browser" }
$readyAnimate = $base; $readyEdit = $base
if (-not ($inst -and (Test-Path $inst))) { $readyAnimate = $false; $missing += "animation_engine" }
if (-not ($einst -and (Test-Path $einst))) { $readyEdit = $false; $missing += "editing_engine" }
Say READY_ANIMATE $(if ($readyAnimate) { "yes" } else { "no" })
Say READY_EDIT $(if ($readyEdit) { "yes" } else { "no" })
Say SETUP_NEEDED $(if ($readyAnimate -and $readyEdit) { "no" } else { "yes" })
Say MISSING $(if ($missing.Count) { $missing -join "," } else { "none" })
# The speech engine is a big download that only the first video needs, so it never blocks the studio.
if ($DataDir -and (Test-Path (Join-Path $DataDir "whisper\.ready"))) { Say SPEECH_ENGINE ready } else { Say SPEECH_ENGINE not_yet }
