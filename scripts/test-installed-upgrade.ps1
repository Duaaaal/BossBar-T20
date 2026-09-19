param(
  [Parameter(Mandatory)][string]$CurrentSetup,
  [Parameter(Mandatory)][string]$BaselineSetup,
  [Parameter(Mandatory)][string]$ExpectedVersion,
  [Parameter(Mandatory)][string]$ReportPath
)
$ErrorActionPreference = 'Stop'
# Installation changes HKCU, shortcuts and AppData. Never run on a user's PC.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Este teste exige um runner Windows descartável hospedado pelo GitHub.'
}
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'boss_battle'))
$localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\') + '\'
if (-not $installRoot.StartsWith($localRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino inválido.' }
if (Test-Path -LiteralPath $installRoot) { throw 'Já existe uma instalação; o runner não está limpo.' }
$results = [Collections.Generic.List[object]]::new()
function Stop-TestApplication {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path.StartsWith($installRoot + '\', [StringComparison]::OrdinalIgnoreCase)
  } | Stop-Process -Force -ErrorAction SilentlyContinue
}
function Run-Installer([string]$Executable, [string[]]$Arguments) {
  $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { throw 'Instalador excedeu três minutos.' }
  if ($process.ExitCode -ne 0) { throw "Instalador falhou: $($process.ExitCode)" }
  Start-Sleep -Seconds 3
  Stop-TestApplication
}
function Check-Installed([string]$Version, [string]$Stage, [string]$Notes = '') {
  $appDirectory = Join-Path $installRoot "app-$Version"
  $executable = Join-Path $appDirectory 'BossBar - Tormenta20.exe'
  if (-not (Test-Path -LiteralPath $executable)) { throw "Executável ausente: $Version" }
  if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'Update.exe'))) { throw 'Atualizador ausente.' }
  $registration = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
    Where-Object { $_.InstallLocation -and $_.InstallLocation.TrimEnd('\') -eq $installRoot }
  if (-not $registration) { throw 'Instalação não registrada no Windows.' }
  $process = Start-Process -FilePath $executable -ArgumentList '--remote-debugging-port=19287' -WindowStyle Hidden -PassThru
  try {
    Start-Sleep -Seconds 8
    $process.Refresh()
    if ($process.HasExited) { throw "Aplicativo encerrou: $($process.ExitCode)" }
    $children = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -and $_.Path.StartsWith($appDirectory + '\', [StringComparison]::OrdinalIgnoreCase)
    })
    if ($children.Count -lt 2) { throw 'Renderizadores do aplicativo não permaneceram ativos.' }
    if ($Stage -ne 'baseline-install') {
      $rawVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
      & node (Join-Path $PSScriptRoot 'check-installed-ui.mjs') $rawVersion $Notes
      if ($LASTEXITCODE -ne 0) { throw 'Interface instalada ou dados do perfil não foram aprovados.' }
    }
    $results.Add(@{ stage = $Stage; version = $Version; processes = $children.Count; status = 'passed' })
  } finally { Stop-TestApplication }
}
try {
  Run-Installer $CurrentSetup @('--silent')
  Check-Installed $ExpectedVersion 'fresh-install'
  Run-Installer (Join-Path $installRoot 'Update.exe') @('--uninstall', '--silent')
  # Squirrel retains its own uninstaller; remove only this disposable app root.
  if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
  Run-Installer $BaselineSetup @('--silent')
  Check-Installed '1.5.2' 'baseline-install'
  $dataDirectories = @('BossBar - Tormenta20', 'boss-battle', 'bossbar-t20') |
    ForEach-Object { Join-Path $env:APPDATA $_ } | Where-Object { Test-Path -LiteralPath $_ }
  if (-not $dataDirectories) { throw 'Nenhum perfil do aplicativo foi criado.' }
  $sentinels = @()
  foreach ($directory in $dataDirectories) {
    $notes = Join-Path $directory 'master-notes.md'
    Set-Content -LiteralPath $notes -Value 'Encontro de homologação: preservar notas após atualização.' -Encoding utf8
    $sentinels += @{ path = $notes; hash = (Get-FileHash -LiteralPath $notes -Algorithm SHA256).Hash }
  }
  Run-Installer $CurrentSetup @('--silent')
  Check-Installed $ExpectedVersion 'upgrade-from-1.5.2' 'Encontro de homologação: preservar notas após atualização.'
  foreach ($sentinel in $sentinels) {
    if ((Get-FileHash -LiteralPath $sentinel.path -Algorithm SHA256).Hash -ne $sentinel.hash) {
      throw 'Atualização alterou as notas existentes.'
    }
  }
  $results.Add(@{ stage = 'preserve-user-data'; files = $sentinels.Count; status = 'passed' })
} finally {
  Stop-TestApplication
  $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}
