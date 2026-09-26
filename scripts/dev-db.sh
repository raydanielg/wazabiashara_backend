#!/usr/bin/env bash
# Starts a local dev Postgres (port 5434) for the backend.
# Data lives in .pgdata/ (gitignored). Uses trust auth — dev only.
set -e
cd "$(dirname "$0")/.."

if [ ! -d .pgdata ]; then
  initdb -D .pgdata --auth=trust --no-instructions
fi

if pg_ctl -D .pgdata status >/dev/null 2>&1; then
  echo "Postgres already running on port 5434"
else
  pg_ctl -D .pgdata -l pg.log -o "-p 5434" start
fi

createdb -h localhost -p 5434 wazabishara 2>/dev/null || true
echo "DATABASE_URL: postgresql://$USER@localhost:5434/wazabishara"
