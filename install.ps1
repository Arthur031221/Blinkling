$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer first.' }
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)'
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22 or newer is required.' }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Install the coding assistant CLI first.' }
$source = if ($env:BLINKLING_MARKETPLACE) { $env:BLINKLING_MARKETPLACE } else { 'Arthur031221/Blinkling' }
claude plugin marketplace add $source
if ($LASTEXITCODE -ne 0) { throw 'Marketplace registration failed.' }
claude plugin install blinkling@blinkling
if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed.' }
Write-Output 'Installed. Start Claude Code with: claude --dangerously-load-development-channels plugin:blinkling@blinkling'
Write-Output 'Then type /blinkling:blinkling. The flag lets Blink''s chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session.'
