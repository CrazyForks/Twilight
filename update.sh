#!/usr/bin/env bash
set -euo pipefail

systemctl stop twilight

git pull origin main

cd webui/
pnpm build
cd ..

go build -o bin/twilight ./cmd/twilight

systemctl restart twilight twilight-bot twilight-scheduler