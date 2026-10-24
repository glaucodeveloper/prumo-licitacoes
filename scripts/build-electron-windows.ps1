param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$Stage = Join-Path $ProjectRoot '.prumo-electron-win-stage'
$Output = Join-Path $ProjectRoot 'output/electron-windows'

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command falhou com código $LASTEXITCODE" }
}

Push-Location $ProjectRoot
try {
  Write-Host '[1/6] Instalando dependências e compilando frontend...'
  Invoke-Checked 'npm.cmd' @('ci', '--no-audit', '--no-fund')
  Invoke-Checked 'npm.cmd' @('run', 'build:frontend')

  Write-Host '[2/6] Montando pacote sem dados pessoais nem chaves...'
  if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
  New-Item -ItemType Directory -Path $Stage, $Output -Force | Out-Null
  $excludedDirs = @(
    (Join-Path $ProjectRoot '.git'),
    (Join-Path $ProjectRoot 'node_modules'),
    (Join-Path $ProjectRoot 'frontend/node_modules'),
    (Join-Path $ProjectRoot '.tokensave'),
    (Join-Path $ProjectRoot 'data'),
    (Join-Path $ProjectRoot '.presentation-build'),
    (Join-Path $ProjectRoot 'dist'),
    (Join-Path $ProjectRoot 'output'),
    (Join-Path $ProjectRoot '.prumo-electron-stage'),
    $Stage
  )
  $excludedFiles = @(
    '.env', '.env.*', 'prumo.config.json', 'prumo.config.example.json',
    '*.pem', '*.key', '*credentials*.json', '*secrets*.json',
    '*.AppImage', '*.exe', '*.zip', 'Thumbs.db', '.DS_Store'
  )
  & robocopy.exe $ProjectRoot $Stage /E /XD $excludedDirs /XF $excludedFiles /NFL /NDL /NP
  $copyCode = $LASTEXITCODE
  if ($copyCode -ge 8) { throw "robocopy falhou com código $copyCode" }

  $electronDir = Join-Path $Stage 'electron'
  New-Item -ItemType Directory -Path $electronDir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $ProjectRoot 'assets/prumo.ico') -Destination (Join-Path $electronDir 'prumo.ico') -Force
  Invoke-Checked 'node.exe' @(
    (Join-Path $ProjectRoot 'scripts/patch-electron-windows.mjs'),
    (Join-Path $Stage 'server.mjs'),
    (Join-Path $Stage 'package.json'),
    $Output
  )
  Invoke-Checked 'node.exe' @('--check', (Join-Path $Stage 'server.mjs'))
  Invoke-Checked 'node.exe' @('--check', (Join-Path $Stage 'electron/main.cjs'))
  Invoke-Checked 'node.exe' @('--check', (Join-Path $Stage 'electron/preload.cjs'))
  Invoke-Checked 'node.exe' @('--check', (Join-Path $Stage 'electron/settings.js'))

  Write-Host '[3/6] Preparação e sintaxe validadas.'
  Write-Host '[4/6] Instalando Electron, electron-builder e dependências da aplicação...'
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
  Invoke-Checked 'npm.cmd' @('install', '--prefix', $Stage, '--no-audit', '--no-fund')

  Write-Host '[5/6] Baixando Chromium Windows do Playwright...'
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $Stage 'browsers'
  Push-Location $Stage
  try {
    Invoke-Checked (Join-Path $Stage 'node_modules/.bin/playwright.cmd') @('install', 'chromium')
  }
  finally {
    Pop-Location
  }
  $browser = Get-ChildItem -LiteralPath $env:PLAYWRIGHT_BROWSERS_PATH -Filter '*.exe' -File -Recurse | Select-Object -First 1
  if (-not $browser) { throw 'O Playwright não instalou o Chromium para Windows.' }

  Write-Host '[6/6] Compilando Electron Windows x64: Portable e Setup...'
  Push-Location $Stage
  try {
    Invoke-Checked (Join-Path $Stage 'node_modules/.bin/electron-builder.cmd') @('--win', '--x64', '--publish', 'never')
  }
  finally {
    Pop-Location
  }

  $version = (Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json).version
  $artifacts = @(
    (Join-Path $Output "Prumo-Licitacoes-Portable-$version-x64.exe"),
    (Join-Path $Output "Prumo-Licitacoes-Setup-$version-x64.exe")
  )
  foreach ($artifact in $artifacts) {
    if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) { throw "Binário não foi gerado: $artifact" }
  }
  Get-Item -LiteralPath $artifacts | Select-Object Name, Length
}
finally {
  Pop-Location
}
