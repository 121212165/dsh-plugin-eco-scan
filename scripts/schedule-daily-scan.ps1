<#
.SYNOPSIS
  注册每天一次 eco-core scan 的 Windows 计划任务（issue #11）。
  仅注册任务，不立即执行；用 -Unregister 可移除。
.EXAMPLE
  pwsh -File scripts/schedule-daily-scan.ps1 -TaskName eco-core-daily -Hour 3
  pwsh -File scripts/schedule-daily-scan.ps1 -Unregister
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'eco-core-daily',
  [ValidateRange(0, 23)][int]$Hour = 3,
  [int]$Minute = 30,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Unregistered: $TaskName"
  exit 0
}

$action = New-ScheduledTaskAction -Execute 'npx.cmd' -Argument 'eco-core scan'
$trigger = New-ScheduledTaskTrigger -Daily -At (Get-Date -Hour $Hour -Minute $Minute -Second 0)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Registered daily task '$TaskName' at ${Hour}:${Minute} (npx eco-core scan)."
Write-Host "Verify: Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State"
