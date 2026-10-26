#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 or newer from https://nodejs.org then reopen this launcher.'
else
  node scripts/launch.js
fi
printf '\nPress Enter to close…'
read -r answer
