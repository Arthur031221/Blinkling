#!/bin/sh
set -eu

command -v node >/dev/null 2>&1 || { printf '%s\n' 'Install Node.js 22 or newer first.' >&2; exit 1; }
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' || { printf '%s\n' 'Node.js 22 or newer is required.' >&2; exit 1; }
command -v claude >/dev/null 2>&1 || { printf '%s\n' 'Install the coding assistant CLI first.' >&2; exit 1; }
claude plugin marketplace add "${BLINKLING_MARKETPLACE:-Arthur031221/Blinkling}"
claude plugin install blinkling@blinkling
printf '%s\n' 'Installed. Start Claude Code with: claude --dangerously-load-development-channels plugin:blinkling@blinkling'
printf '%s\n' 'Then type /blinkling:blinkling. The flag lets Blink'\''s chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session.'
