# Run manually to authorize background execution at sign-in. Node 24.19+ required.
$Root = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node -ErrorAction Stop).Source
$Action = New-ScheduledTaskAction -Execute $Node -Argument "`"$Root\src\background.ts`"" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'AIHeadquartersWorker' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Explicitly enabled local AI Headquarters research worker'
# Pause/stop: Stop-ScheduledTask AIHeadquartersWorker; Disable-ScheduledTask AIHeadquartersWorker
