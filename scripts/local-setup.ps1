# AI Headquarters user-scoped local setup. Windows PowerShell 5.1+, no administrator required.
# Downloads only a verified official portable Node runtime; never a model or paid service.
param([string]$SourceDirectory = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:InstallRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'AIHeadquarters'
$script:DataRoot = Join-Path $script:InstallRoot 'data'
$script:StatePath = Join-Path $script:InstallRoot 'server-state.json'
$script:SamKeyPath = Join-Path $script:InstallRoot 'sam-api-key.dpapi'
$script:SamKeyInput = $null
$script:BaseUrl = 'http://127.0.0.1:4310'
$script:NodeVersion = '24.19.0'
$script:DesktopShortcut = $null
$script:SourceRoot = [IO.Path]::GetFullPath($SourceDirectory)
$script:StatusLabel = $null
$script:OperationRunning = $false

function Show-Information([string]$Text) {
    [void][System.Windows.Forms.MessageBox]::Show($Text, 'AI Headquarters', 'OK', 'Information')
}
function Show-Problem([string]$Text) {
    [void][System.Windows.Forms.MessageBox]::Show($Text, 'AI Headquarters - action needed', 'OK', 'Error')
}
function Set-Progress([string]$Text) {
    if ($script:StatusLabel) { $script:StatusLabel.Text = $Text; $script:StatusLabel.Refresh() }
    [System.Windows.Forms.Application]::DoEvents()
}
function Protect-InstallFolder {
    [void][IO.Directory]::CreateDirectory($script:InstallRoot)
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $identities = @([Security.Principal.WindowsIdentity]::GetCurrent().User,
        (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),
        (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    foreach ($identity in $identities) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $script:InstallRoot -AclObject $acl
    [void][IO.Directory]::CreateDirectory($script:DataRoot)
}
function Get-Device {
    $arch = ''
    try {
        $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
        if ($architecture -eq 'Arm64') { $arch = 'arm64' }
        elseif ($architecture -eq 'X64') { $arch = 'x64' }
    } catch { }
    if (-not $arch) {
        $nativeArch = $env:PROCESSOR_ARCHITEW6432
        if (-not $nativeArch) { $nativeArch = $env:PROCESSOR_ARCHITECTURE }
        if ($nativeArch -eq 'ARM64') { $arch = 'arm64' }
        elseif ($nativeArch -eq 'AMD64') { $arch = 'x64' }
    }
    if (-not $arch) { throw 'This launcher supports 64-bit Windows (x64 or ARM64). It does not install a runtime on this device.' }
    $memory = 'not detected'
    try { $memory = ('{0:N1} GB RAM' -f ((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)) } catch { }
    return @{ Architecture = $arch; Memory = $memory }
}
function Read-State {
    if (-not (Test-Path -LiteralPath $script:StatePath)) { return $null }
    try { return Get-Content -LiteralPath $script:StatePath -Raw | ConvertFrom-Json } catch { throw 'The local server state file could not be read. Your data was not changed. Open the local folder for assistance.' }
}
function Write-State($State) {
    $temporary = $script:StatePath + '.new'
    $State | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $script:StatePath -Force
}
function Get-OwnedProcess($State) {
    if (-not $State) { return $null }
    try {
        $process = Get-Process -Id ([int]$State.ProcessId) -ErrorAction Stop
        if ($process.Path -ne [string]$State.Executable) { return $null }
        if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne [string]$State.StartTicks) { return $null }
        $command = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + [int]$State.ProcessId)).CommandLine
        $expectedServer = Join-Path ([string]$State.AppDirectory) 'src\server.ts'
        if (-not $command -or $command.IndexOf($expectedServer, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }
        return $process
    } catch { return $null }
}
function Get-LocalStatus {
    # Explicitly bypass system proxies only for the loopback readiness request.
    # No remote TLS or package verification setting is changed.
    $response = $null
    try {
        $request = [Net.HttpWebRequest]::Create($script:BaseUrl + '/api/status')
        $request.Proxy = $null; $request.Timeout = 2000; $request.ReadWriteTimeout = 2000; $request.AllowAutoRedirect = $false
        $response = $request.GetResponse()
        if ($response.ContentLength -gt 65536) { return $null }
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { return $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    } catch { return $null } finally { if ($response) { $response.Dispose() } }
}
function Test-LocalPort {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', 4310, $null, $null)
        try {
            if (-not $pending.AsyncWaitHandle.WaitOne(1000)) { return $false }
            $client.EndConnect($pending)
            return $true
        } finally { $pending.AsyncWaitHandle.Close() }
    } catch { return $false } finally { $client.Close() }
}
function Assert-OfficialNode([string]$Executable) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Executable
    if ($signature.Status -ne 'Valid') { throw 'Windows could not validate the portable Node executable signature. Setup stopped without disabling verification. Check Windows updates, clock and certificate access, then retry.' }
    $reportedVersion = (& $Executable --version 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $reportedVersion -ne ('v' + $script:NodeVersion)) { throw 'The local Node runtime does not match the expected version. Setup stopped; no replacement checksum was accepted.' }
}
function Ensure-Node([string]$Architecture) {
    $archiveName = 'node-v' + $script:NodeVersion + '-win-' + $Architecture + '.zip'
    $runtimeName = [IO.Path]::GetFileNameWithoutExtension($archiveName)
    $runtimeRoot = Join-Path $script:InstallRoot 'runtimes'
    $node = Join-Path (Join-Path $runtimeRoot $runtimeName) 'node.exe'
    if (Test-Path -LiteralPath $node) { Assert-OfficialNode $node; return $node }
    Set-Progress 'Downloading the official portable Node runtime. This is not an AI model.'
    [void][IO.Directory]::CreateDirectory($runtimeRoot)
    $cache = Join-Path $script:InstallRoot 'downloads'
    [void][IO.Directory]::CreateDirectory($cache)
    $archive = Join-Path $cache $archiveName
    $checksums = Join-Path $cache ('SHASUMS256-' + $script:NodeVersion + '.txt')
    $base = 'https://nodejs.org/dist/v' + $script:NodeVersion + '/'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt') -OutFile $checksums -TimeoutSec 60
    $pattern = '(?m)^([a-fA-F0-9]{64})\s+' + [regex]::Escape($archiveName) + '\s*$'
    $match = [regex]::Match([IO.File]::ReadAllText($checksums), $pattern)
    if (-not $match.Success) { throw 'The official Node checksum list did not contain this device runtime. No runtime was installed.' }
    $expected = $match.Groups[1].Value
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing -Uri ($base + $archiveName) -OutFile $archive -TimeoutSec 180 }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
        Remove-Item -LiteralPath $archive -Force
        throw 'Node download failed its official SHA-256 integrity check. The affected download was removed. Retry with a working connection; setup will not bypass verification.'
    }
    Set-Progress 'Verifying and preparing the portable runtime.'
    $staging = Join-Path $runtimeRoot ('stage-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($staging)
    try {
        Expand-Archive -LiteralPath $archive -DestinationPath $staging
        $extracted = Join-Path $staging $runtimeName
        Assert-OfficialNode (Join-Path $extracted 'node.exe')
        Move-Item -LiteralPath $extracted -Destination (Join-Path $runtimeRoot $runtimeName)
    } finally { if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force } }
    return $node
}
function Get-SafeTreeFiles([string]$Directory) {
    $root = Get-Item -LiteralPath $Directory
    if (($root.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked source folders are not accepted in a local installation package.' }
    foreach ($item in Get-ChildItem -LiteralPath $Directory) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked source files or folders are not accepted in a local installation package.' }
        if ($item.PSIsContainer) { Get-SafeTreeFiles $item.FullName } else { $item }
    }
}
function Get-PackageFiles {
    $manifest = Join-Path $script:SourceRoot 'package.json'
    if (-not (Test-Path -LiteralPath $manifest)) { throw 'Extract the complete AI Headquarters ZIP before starting. The source package is incomplete.' }
    $package = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    if ($package.name -ne 'ai-headquarters') { throw 'This is not an AI Headquarters source package.' }
    foreach ($required in @('src\server.ts', 'src\store.ts', 'public\index.html', 'package-lock.json', 'Start-AI-Headquarters.cmd')) {
        if (-not (Test-Path -LiteralPath (Join-Path $script:SourceRoot $required))) { throw ('The extracted package is missing ' + $required + '. Download and extract the complete ZIP.') }
    }
    $files = New-Object 'System.Collections.Generic.List[System.IO.FileInfo]'
    foreach ($folder in @('src','public','scripts','test')) {
        $path = Join-Path $script:SourceRoot $folder
        if (Test-Path -LiteralPath $path) {
            foreach ($item in Get-SafeTreeFiles $path) {
                $files.Add($item)
            }
        }
    }
    foreach ($item in Get-ChildItem -LiteralPath $script:SourceRoot -File) {
        if ($item.Name -in @('package.json','package-lock.json','Start-AI-Headquarters.cmd','LICENSE','LICENSE.txt') -or $item.Extension -eq '.md') { $files.Add($item) }
    }
    return @($files | Sort-Object FullName)
}
function Get-RelativeSourcePath([string]$Path) {
    $prefix = $script:SourceRoot.TrimEnd('\') + '\'
    if (-not $Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'The source package contains a path outside its extracted folder.' }
    return $Path.Substring($prefix.Length)
}
function Install-App([string]$Node) {
    $files = @(Get-PackageFiles)
    $description = ($files | ForEach-Object { (Get-RelativeSourcePath $_.FullName) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "`n"
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($description))).Replace('-','').ToLowerInvariant().Substring(0,20) } finally { $sha.Dispose() }
    $versions = Join-Path $script:InstallRoot 'versions'
    [void][IO.Directory]::CreateDirectory($versions)
    $destination = Join-Path $versions $fingerprint
    if (Test-Path -LiteralPath $destination) {
        # Never overwrite an existing installed version or its user's changes.
        return $destination
    }
    Set-Progress 'Preparing a new app version. Existing versions, founder account and data are kept.'
    $staging = Join-Path $versions ('stage-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($staging)
    try {
        foreach ($file in $files) {
            $target = Join-Path $staging (Get-RelativeSourcePath $file.FullName)
            [void][IO.Directory]::CreateDirectory((Split-Path -Parent $target))
            Copy-Item -LiteralPath $file.FullName -Destination $target
        }
        Set-Progress 'Installing the locked free application dependencies. Your data is not touched.'
        $npm = Join-Path (Split-Path -Parent $Node) 'npm.cmd'
        $previousPath = $env:PATH; $previousCache = $env:npm_config_cache
        try {
            $env:PATH = (Split-Path -Parent $Node) + ';' + $previousPath
            $env:npm_config_cache = Join-Path $script:InstallRoot 'npm-cache'
            Push-Location $staging
            try {
                & $npm ci --ignore-scripts --no-audit --no-fund *> (Join-Path $script:InstallRoot 'install.log')
                if ($LASTEXITCODE -ne 0) { throw 'Application dependency installation failed. See install.log in the local folder. Package integrity checks were not disabled.' }
            } finally { Pop-Location }
        } finally { $env:PATH = $previousPath; $env:npm_config_cache = $previousCache }
        Move-Item -LiteralPath $staging -Destination $destination
    } finally {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }
    return $destination
}
function Invoke-LocalOperation([scriptblock]$Action) {
    $mutexName = 'Local\AIHeadquarters-Setup-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutex = New-Object Threading.Mutex($false, $mutexName)
    $entered = $false
    try {
        try { $entered = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $entered = $true }
        if (-not $entered) { throw 'Another AI Headquarters setup operation is running. Let it finish before starting, stopping or importing.' }
        $script:OperationRunning = $true
        & $Action
    } finally {
        $script:OperationRunning = $false
        if ($entered) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
function Write-RestoreHelper([string]$Directory) {
    $path = Join-Path $Directory 'database-restore.mjs'
    $content = @'
import {DatabaseSync, backup} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const [mode,source,destination]=process.argv.slice(2);
function openVerified(path){
 const db=new DatabaseSync(path,{readOnly:true,timeout:5000});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integrity check failed');
  for(const [table,columns] of Object.entries({tasks:['id','goal','agent','status'],founder:['id','salt','hash'],settings:['key','value']})){
   if(db.prepare("SELECT type FROM sqlite_schema WHERE name=?").get(table)?.type!=='table')throw Error('Not an application database');
   const actual=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
   if(!columns.every(column=>actual.has(column)))throw Error('Application schema does not match');
  }
  return db;
 }catch(error){db.close();throw error;}
}
let db;
try{
 if(!['verify','copy'].includes(mode)||!source)throw Error('Invalid operation');
 db=openVerified(source);
 if(mode==='copy'){
  if(!destination||existsSync(destination)||resolve(source).toLowerCase()===resolve(destination).toLowerCase())throw Error('Destination must be a new staging file');
  await backup(db,destination);db.close();db=undefined;
  const checkpoint=new DatabaseSync(destination);
  try{checkpoint.exec('PRAGMA trusted_schema=OFF; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');}finally{checkpoint.close();}
  const verify=openVerified(destination);verify.close();
 }
 console.log('Application database verified.');
}catch{
 console.error('Database validation or consistent backup failed. Source contents were not displayed.');process.exitCode=1;
}finally{if(db)db.close();}
'@
    [IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding($false)))
    return $path
}
function Invoke-DatabaseHelper([string]$Node, [string]$Helper, [string]$Mode, [string]$Source, [string]$Destination) {
    try {
        $arguments = @($Helper, $Mode, $Source)
        if ($Destination) { $arguments += $Destination }
        & $Node @arguments *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Invalid database or failed backup' }
    } catch { throw 'Database integrity/schema validation or consistent backup failed. The selected file must be a complete, trusted AI Headquarters SQLite backup; its contents were not displayed.' }
}
function Assert-OfficeStopped {
    $state = Read-State
    if (Get-OwnedProcess $state) { throw 'Stop the local office with Stop office before importing. The running process was not interrupted.' }
    if (Test-LocalPort) { throw 'Port 4310 is still in use. Import is blocked while any office or unknown application uses that port. Nothing was stopped or overwritten.' }
}
function Import-OfficeBackup {
    Protect-InstallFolder
    Assert-OfficeStopped
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Select your trusted AI Headquarters database backup'
    $dialog.Filter = 'AI Headquarters SQLite backup (*.sqlite)|*.sqlite'
    $dialog.CheckFileExists = $true
    if ($dialog.ShowDialog() -ne 'OK') { $dialog.Dispose(); return }
    $source = [IO.Path]::GetFullPath($dialog.FileName)
    $dialog.Dispose()
    $database = Join-Path $script:DataRoot 'headquarters.sqlite'
    if ($source.Equals([IO.Path]::GetFullPath($database), [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose an exported backup file, not the currently installed database.' }
    $device = Get-Device
    $node = Ensure-Node $device.Architecture
    $staging = Join-Path $script:InstallRoot ('restore-stage-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($staging)
    $helper = Write-RestoreHelper $staging
    $prepared = Join-Path $staging 'imported-headquarters.sqlite'
    $recovery = $null
    $moved = New-Object 'System.Collections.Generic.List[object]'
    $installed = $false
    try {
        Set-Progress 'Validating the selected backup and preparing a consistent staging database. Current data is unchanged.'
        Invoke-DatabaseHelper $node $helper 'copy' $source $prepared
        $answer = [System.Windows.Forms.MessageBox]::Show("Import this backup as your local office?`r`n`r`n$source`r`n`r`nIts founder login and records will replace the local office. Current local data will first receive a verified recovery backup and an archive. Your selected file remains unchanged. Use the founder password from the imported backup after starting.`r`n`r`nContinue?", 'Confirm database import', 'YesNo', 'Warning')
        if ($answer -ne 'Yes') { Set-Progress 'Import cancelled. Existing local data was not changed.'; return }
        Assert-OfficeStopped
        $recovery = Join-Path (Join-Path $script:InstallRoot 'recovery') ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
        [void][IO.Directory]::CreateDirectory($recovery)
        if (Test-Path -LiteralPath $database) {
            Set-Progress 'Creating and verifying a recovery backup before replacing the local office.'
            Invoke-DatabaseHelper $node $helper 'copy' $database (Join-Path $recovery 'verified-before-import.sqlite')
        } elseif ((Test-Path -LiteralPath ($database + '-wal')) -or (Test-Path -LiteralPath ($database + '-shm'))) {
            throw 'Orphaned SQLite sidecars exist without the main database. Import stopped for recovery review; the files were not changed.'
        }
        Assert-OfficeStopped
        Set-Progress 'Archiving the stopped office database and installing the verified backup.'
        foreach ($suffix in @('', '-wal', '-shm')) {
            $original = $database + $suffix
            if (Test-Path -LiteralPath $original) {
                $archived = Join-Path $recovery ('original-headquarters.sqlite' + $suffix)
                Move-Item -LiteralPath $original -Destination $archived
                $moved.Add([PSCustomObject]@{ Original = $original; Archived = $archived })
            }
        }
        # This is a same-volume rename into an absent pathname; no existing DB is overwritten.
        Move-Item -LiteralPath $prepared -Destination $database
        $installed = $true
        Invoke-DatabaseHelper $node $helper 'verify' $database $null
        [IO.File]::WriteAllText((Join-Path $recovery 'RESTORE-INFO.txt'), "Import completed. verified-before-import.sqlite is the consistent previous local database, when a local database existed. original-headquarters.sqlite and its matching sidecars preserve the stopped original files. Keep these private. The selected imported backup was not modified.", (New-Object Text.UTF8Encoding($false)))
        Set-Progress ('Backup imported. Start / open office to use its existing founder login. Recovery files are kept at ' + $recovery)
        Show-Information ('Import completed. The office was not started automatically. Click Start / open office and sign in with the imported backup founder password. Previous local data is retained at: ' + $recovery)
    } catch {
        $problem = $_.Exception.Message
        $rollbackFailed = $false
        if ($recovery) {
            try {
                if ($installed -and (Test-Path -LiteralPath $database)) {
                    Move-Item -LiteralPath $database -Destination (Join-Path $recovery 'failed-import.sqlite')
                    foreach ($suffix in @('-wal','-shm')) {
                        if (Test-Path -LiteralPath ($database + $suffix)) { Move-Item -LiteralPath ($database + $suffix) -Destination (Join-Path $recovery ('failed-import.sqlite' + $suffix)) }
                    }
                }
                foreach ($entry in $moved) {
                    if (Test-Path -LiteralPath $entry.Original) { throw 'Cannot restore over an unexpected file' }
                    Move-Item -LiteralPath $entry.Archived -Destination $entry.Original
                }
            } catch { $rollbackFailed = $true }
        }
        if ($rollbackFailed) { throw ('Import did not complete and automatic rollback needs review. Do not start the office. Recovery copies are preserved at ' + $recovery + '. The selected backup was not modified.') }
        throw ('Import stopped; any archived original files were restored. ' + $problem + $(if ($recovery) { ' Recovery backup retained at ' + $recovery } else { '' }))
    } finally {
        # Only generated staging files are removed, never the selected source or recovery archive.
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }
}

function New-SetupCode {
    $bytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
}
function Encode-PrivateCode([string]$Code) {
    return (ConvertTo-SecureString -String $Code -AsPlainText -Force | ConvertFrom-SecureString)
}
function Decode-PrivateCode([string]$ProtectedCode) {
    $secure = ConvertTo-SecureString -String $ProtectedCode
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Save-SamKey {
    $value = $script:SamKeyInput.Text.Trim()
    if (-not $value -or $value.Length -gt 1024 -or $value -match '\s') { throw 'Paste your SAM.gov API key without spaces. The key is optional and is never displayed from saved storage.' }
    try {
        Protect-InstallFolder
        $protected = Encode-PrivateCode $value
        $temporary = $script:SamKeyPath + '.new'
        [IO.File]::WriteAllText($temporary, $protected, [Text.Encoding]::ASCII)
        Move-Item -LiteralPath $temporary -Destination $script:SamKeyPath -Force
        Show-Information 'Your SAM.gov API key was saved encrypted for this Windows user. An existing office process was not stopped or changed. If the office is already running, click Stop office, then Start / open office to apply the new key. Never paste this key in chat.'
    } finally { $script:SamKeyInput.Text = ''; $value = $null }
}
function Read-SavedSamKey {
    if (-not (Test-Path -LiteralPath $script:SamKeyPath)) { return $null }
    try {
        $value = Decode-PrivateCode ([IO.File]::ReadAllText($script:SamKeyPath))
        if (-not $value -or $value.Length -gt 1024 -or $value -match '\s') { throw 'Invalid saved credential' }
        return $value
    } catch { throw 'The saved SAM.gov key could not be decrypted for this Windows user. Save it again in the optional key field. No key value was logged or displayed.' }
}
function Open-Office($Status, $State) {
    $url = $script:BaseUrl
    if ($Status.setupRequired) {
        if (-not $State -or -not $State.SetupCodeProtected) { throw 'This office was started outside the wizard. Use its original local setup code, or stop it from its original launcher and start it here. No existing account was changed.' }
        $code = Decode-PrivateCode $State.SetupCodeProtected
        $url += '/#setup=' + [Uri]::EscapeDataString($code)
    } elseif ($State -and $State.SetupCodeProtected) {
        $State.SetupCodeProtected = ''
        Write-State $State
    }
    Start-Process $url
}
function Create-Shortcut([string]$App) {
    if (-not $script:DesktopShortcut.Checked) { return }
    $path = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AI Headquarters.lnk'
    if (Test-Path -LiteralPath $path) {
        $answer = [System.Windows.Forms.MessageBox]::Show('Replace the existing AI Headquarters desktop shortcut with this version? Your app versions and data will be kept.', 'Update desktop shortcut', 'YesNo', 'Question')
        if ($answer -ne 'Yes') { return }
    }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = Join-Path $App 'Start-AI-Headquarters.cmd'
    $shortcut.WorkingDirectory = $App
    $shortcut.Description = 'Open the local AI Headquarters setup and office'
    $shortcut.Save()
}
function Start-Office {
    Set-Progress 'Checking your device and existing local office.'
    Protect-InstallFolder
    $device = Get-Device
    $state = Read-State
    $existing = Get-OwnedProcess $state
    $status = Get-LocalStatus
    if ($status) {
        if (-not ($status.PSObject.Properties.Name -contains 'product') -or $status.product -ne 'ai-headquarters') { throw 'Port 4310 is occupied by another application. It was not stopped or modified.' }
        if (-not $existing) {
            if ($status.setupRequired) { throw 'An AI Headquarters instance was started elsewhere. Use that launcher to finish setup or stop it. This wizard will not replace an unknown process.' }
            Open-Office $status $null
            Set-Progress 'Your existing local office is open. It was not replaced.'
            return
        }
        Open-Office $status $state
        Set-Progress 'Your existing local office is open. To install a newer downloaded version, stop the office first, then start from that new package.'
        return
    }
    if ($existing) { throw 'Your previously started office process is present but not ready. It was not replaced. Use Stop office before trying again, or inspect the local logs.' }
    if (Test-LocalPort) { throw 'Port 4310 is already in use, but it did not identify a ready AI Headquarters office. No unknown process was stopped. Close that application or inspect the local logs before retrying.' }
    $node = Ensure-Node $device.Architecture
    $app = Install-App $node
    Set-Progress 'Starting your private local office.'
    $code = New-SetupCode
    $names = @('HOST','PORT','HQ_DATA_DIR','HQ_SETUP_CODE','RENDER','PUBLIC_ORIGIN','RENDER_EXTERNAL_URL','NODE_OPTIONS','SAM_API_KEY')
    $saved = @{}
    foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
        $env:HOST = '127.0.0.1'; $env:PORT = '4310'; $env:HQ_DATA_DIR = $script:DataRoot; $env:HQ_SETUP_CODE = $code
        $samKey = Read-SavedSamKey
        if ($samKey) { $env:SAM_API_KEY = $samKey }
        # With no saved local key, retain an already injected process SAM_API_KEY. Never print it.
        foreach ($name in @('RENDER','PUBLIC_ORIGIN','RENDER_EXTERNAL_URL','NODE_OPTIONS')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
        $server = Join-Path $app 'src\server.ts'
        $process = Start-Process -FilePath $node -ArgumentList @(('"' + $server + '"')) -WorkingDirectory $app -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:InstallRoot 'server.log') -RedirectStandardError (Join-Path $script:InstallRoot 'server-error.log')
    } finally { foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }; $samKey = $null }
    $state = [PSCustomObject]@{ ProcessId = $process.Id; StartTicks = $process.StartTime.ToUniversalTime().Ticks.ToString(); Executable = $node; AppDirectory = $app; SetupCodeProtected = (Encode-PrivateCode $code) }
    Write-State $state
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($process.HasExited) { throw 'The office stopped before becoming ready. See server-error.log in the local folder. Your saved business data was not reset.' }
        $status = Get-LocalStatus
        if ($status -and ($status.PSObject.Properties.Name -contains 'product') -and $status.product -eq 'ai-headquarters') {
            Create-Shortcut $app
            Open-Office $status $state
            Set-Progress 'Your local office is open. Closing the browser does not stop it. Clock out in the app to pause work, or use Stop office here.'
            return
        }
        Start-Sleep -Milliseconds 500
        [System.Windows.Forms.Application]::DoEvents()
    }
    throw 'The office has not become ready yet. Do not launch a second copy. Open the local folder to inspect server-error.log, or stop the owned office and retry.'
}
function Stop-Office {
    $state = Read-State
    $process = Get-OwnedProcess $state
    if (-not $process) { Show-Information 'No office process owned by this launcher was found. Other applications were not stopped.'; return }
    $answer = [System.Windows.Forms.MessageBox]::Show('Stop this local office process? Research and model work will stop. Saved database checkpoints remain; interrupted work can be recovered after the next start. Closing only the browser would leave the office running.', 'Stop local office', 'YesNo', 'Question')
    if ($answer -ne 'Yes') { return }
    Stop-Process -Id $process.Id -ErrorAction Stop
    if (-not $process.WaitForExit(5000)) { throw 'The local office is still stopping. Wait before launching another copy.' }
    Set-Progress 'Local office stopped. Your data and installed versions were kept.'
}

try {
    $device = Get-Device
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'AI Headquarters - local setup'
    $form.Size = New-Object Drawing.Size(700, 695)
    $form.MinimumSize = $form.Size
    $form.Add_FormClosing({ param($sender, $eventArgs) if ($script:OperationRunning) { $eventArgs.Cancel = $true; Show-Information 'Let the active setup or database operation finish before closing this window.' } })
    $form.StartPosition = 'CenterScreen'
    $form.Font = New-Object Drawing.Font('Segoe UI', 10)
    $heading = New-Object System.Windows.Forms.Label
    $heading.Text = 'Your office, on your computer'
    $heading.Location = New-Object Drawing.Point(24, 20)
    $heading.Size = New-Object Drawing.Size(640, 35)
    $heading.Font = New-Object Drawing.Font('Segoe UI', 18, [Drawing.FontStyle]::Bold)
    $form.Controls.Add($heading)
    $description = New-Object System.Windows.Forms.Label
    $description.Location = New-Object Drawing.Point(25, 68)
    $description.Size = New-Object Drawing.Size(635, 190)
    $description.Text = "Detected: Windows $($device.Architecture), $($device.Memory).`r`n`r`nStart installs a portable Node runtime and locked app dependencies, then opens your normal browser. No coding, administrator account, paid hosting or AI model download is required.`r`n`r`nYour founder login, business records and backups stay in:`r`n$script:DataRoot`r`n`r`nThis wizard does not import your Render database automatically."
    $form.Controls.Add($description)
    $samLabel = New-Object System.Windows.Forms.Label
    $samLabel.Location = New-Object Drawing.Point(25, 265); $samLabel.Size = New-Object Drawing.Size(635, 34)
    $samLabel.Text = 'Optional: SAM.gov API key for current government bid opportunities (masked, never loaded into this field).'
    $script:SamKeyInput = New-Object System.Windows.Forms.TextBox
    $script:SamKeyInput.Location = New-Object Drawing.Point(25, 305); $script:SamKeyInput.Size = New-Object Drawing.Size(405, 28)
    $script:SamKeyInput.UseSystemPasswordChar = $true; $script:SamKeyInput.MaxLength = 1024
    $samSave = New-Object System.Windows.Forms.Button
    $samSave.Text = 'Save SAM key'; $samSave.Location = New-Object Drawing.Point(445, 302); $samSave.Size = New-Object Drawing.Size(170, 34)
    $samSave.Add_Click({ try { Invoke-LocalOperation { Save-SamKey } } catch { $script:SamKeyInput.Text = ''; Show-Problem $_.Exception.Message } })
    $samHelp = New-Object System.Windows.Forms.LinkLabel
    $samHelp.Text = 'Official SAM.gov API / free account and API-key instructions'
    $samHelp.Location = New-Object Drawing.Point(25, 347); $samHelp.Size = New-Object Drawing.Size(635, 32)
    $samHelp.Add_LinkClicked({ Start-Process 'https://open.gsa.gov/api/get-opportunities-public-api/' })
    $form.Controls.AddRange(@($samLabel,$script:SamKeyInput,$samSave,$samHelp))
    $script:DesktopShortcut = New-Object System.Windows.Forms.CheckBox
    $script:DesktopShortcut.Text = 'Create an AI Headquarters desktop shortcut'
    $script:DesktopShortcut.Location = New-Object Drawing.Point(26, 390)
    $script:DesktopShortcut.Size = New-Object Drawing.Size(600, 28)
    $script:DesktopShortcut.Checked = $true
    $form.Controls.Add($script:DesktopShortcut)
    $start = New-Object System.Windows.Forms.Button
    $start.Text = 'Start / open office'; $start.Location = New-Object Drawing.Point(25, 435); $start.Size = New-Object Drawing.Size(190, 40)
    $stop = New-Object System.Windows.Forms.Button
    $stop.Text = 'Stop office'; $stop.Location = New-Object Drawing.Point(230, 435); $stop.Size = New-Object Drawing.Size(145, 40)
    $folder = New-Object System.Windows.Forms.Button
    $folder.Text = 'Open local folder'; $folder.Location = New-Object Drawing.Point(390, 435); $folder.Size = New-Object Drawing.Size(160, 40)
    $import = New-Object System.Windows.Forms.Button
    $import.Text = 'Import database backup'; $import.Location = New-Object Drawing.Point(25, 485); $import.Size = New-Object Drawing.Size(230, 36)
    $script:StatusLabel = New-Object System.Windows.Forms.Label
    $script:StatusLabel.Location = New-Object Drawing.Point(25, 540); $script:StatusLabel.Size = New-Object Drawing.Size(635, 90)
    $script:StatusLabel.Text = 'Internet is needed for first setup, public research and optional model installation. Ollama is optional and can be configured in the app. Work pauses when this computer sleeps or shuts down.'
    $start.Add_Click({
        $start.Enabled = $false; $stop.Enabled = $false; $import.Enabled = $false; $samSave.Enabled = $false
        try { Invoke-LocalOperation { Start-Office } } catch { Set-Progress 'Setup needs attention. Existing data was not reset.'; Show-Problem $_.Exception.Message }
        finally { $start.Enabled = $true; $stop.Enabled = $true; $import.Enabled = $true; $samSave.Enabled = $true }
    })
    $stop.Add_Click({ try { Invoke-LocalOperation { Stop-Office } } catch { Show-Problem $_.Exception.Message } })
    $import.Add_Click({
        $start.Enabled = $false; $stop.Enabled = $false; $import.Enabled = $false; $samSave.Enabled = $false
        try { Invoke-LocalOperation { Import-OfficeBackup } } catch { Set-Progress 'Import needs attention. Do not start the office until the message is resolved.'; Show-Problem $_.Exception.Message }
        finally { $start.Enabled = $true; $stop.Enabled = $true; $import.Enabled = $true; $samSave.Enabled = $true }
    })
    $folder.Add_Click({ [void][IO.Directory]::CreateDirectory($script:InstallRoot); Start-Process explorer.exe -ArgumentList @(('"' + $script:InstallRoot + '"')) })
    $form.Controls.AddRange(@($start,$stop,$folder,$import,$script:StatusLabel))
    [void]$form.ShowDialog()
} catch {
    Show-Problem $_.Exception.Message
    exit 1
}
