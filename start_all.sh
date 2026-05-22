#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "   Twilight Starting..."
echo "=========================================="

echo "Starting Go Backend..."
bash "$SCRIPT_DIR/start_backend_prod.sh" all &
BACKEND_PID=$!

sleep 2

echo "Starting Frontend..."
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. On NixOS, run 'nix develop' first." >&2
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi

(
  cd webui
  pnpm start -p 3000
) &
FRONTEND_PID=$!

sleep 5

echo "=========================================="
echo "   All services are launching"
echo "   Backend: http://127.0.0.1:5000/api/v1/docs"
echo "   Frontend: http://localhost:3000"
echo "=========================================="
echo "Press Ctrl+C to stop all services."

trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; exit' INT TERM

wait
