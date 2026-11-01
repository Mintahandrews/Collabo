#!/usr/bin/env bash
# Collabo host setup — run on a fresh Ubuntu VM (Oracle Always Free, any VPS).
# Installs Docker, clones this repo, builds, runs with compose, and pre-pulls
# the room app images so first launch is fast.
#
#   curl -fsSL https://get.docker.com | sh          # if you prefer upstream
#   bash scripts/setup-host.sh https://github.com/you/Collabo.git
#
set -euo pipefail

REPO="${1:-.}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[setup] installing docker"
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io docker-compose-v2 2>/dev/null \
    || sudo apt-get install -y -qq docker.io docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
  echo "[setup] docker installed — log out/in if 'permission denied' appears"
fi

if [ "$REPO" != "." ] && [ ! -d Collabo ]; then
  git clone "$REPO" Collabo
fi
cd Collabo 2>/dev/null || cd "$REPO"

echo "[setup] building app image"
docker compose build

echo "[setup] starting app"
docker compose up -d

echo "[setup] pre-pulling room app images (multi-GB, one-time)"
docker pull lscr.io/linuxserver/freecad:latest || true
docker pull lscr.io/linuxserver/blender:latest || true

echo "[setup] done — app at http://localhost:3000 (check: curl localhost:3000/health)"
