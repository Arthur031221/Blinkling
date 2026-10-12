#!/bin/sh
set -eu

command -v node >/dev/null 2>&1 || { printf '%s\n' 'Install Node.js 22 or newer first.' >&2; exit 1; }
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' || { printf '%s\n' 'Node.js 22 or newer is required.' >&2; exit 1; }
command -v claude >/dev/null 2>&1 || { printf '%s\n' 'Install the coding assistant CLI first.' >&2; exit 1; }
claude plugin marketplace add "${GLIMPSELET_MARKETPLACE:-Arthur031221/Glimpselet}"
claude plugin install glimpselet@glimpselet
printf '%s\n' 'Installed. Restart your coding session if prompted, then run /glimpselet:glimpse.'
