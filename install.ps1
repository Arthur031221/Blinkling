$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer first.' }
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)'
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22 or newer is required.' }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Install the coding assistant CLI first.' }
$source = if ($env:GLIMPSELET_MARKETPLACE) { $env:GLIMPSELET_MARKETPLACE } else { 'Arthur031221/Glimpselet' }
claude plugin marketplace add $source
if ($LASTEXITCODE -ne 0) { throw 'Marketplace registration failed.' }
claude plugin install glimpselet@glimpselet
if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed.' }
Write-Output 'Installed. Restart your coding session if prompted, then run /glimpselet:glimpse.'
