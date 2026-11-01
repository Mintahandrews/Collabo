#!/usr/bin/env bash
# Collabo host setup — Oracle Cloud Always Free ARM VM (Ubuntu 22.04 aarch64),
# also works on any Ubuntu/Debian Docker-capable host.
#
#   bash setup-host.sh https://github.com/<you>/Collabo.git
#
# BEFORE RUNNING (in the OCI console):
#   Networking → your VCN → Subnets → Security Lists → Add Ingress Rule:
#   Stateless: No | Source CIDR: 0.0.0.0/0 | Protocol: TCP | Port: 3000
set -euo pipefail

REPO="${1:-.}"
cd "$(dirname "$0")/.." 2>/dev/null || true

echo "[setup] docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  exec sudo -u "$USER" bash -c "cd $PWD; bash scripts/setup-host.sh '$REPO'" || {
    echo "[setup] re-run after: newgrp docker"; exit 0; }
fi

echo "[setup] compose plugin"
docker compose version >/dev/null 2>&1 || {
  sudo apt-get update -qq
  sudo apt-get install -y docker-compose-v2 2>/dev/null \
    || sudo apt-get install -y docker-compose-plugin; }

echo "[setup] 4GB swap (pre-pulls + FreeCAD need headroom)"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile \
    && sudo mkswap /swapfile && sudo swapon /swapfile \
    && echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
fi

echo "[setup] open port 3000 in host firewall (Oracle blocks all but ssh)"
sudo iptables -C INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT 5 -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || \
  sudo sh -c 'iptables-save > /etc/iptables/rules.v4' 2>/dev/null || true

if [ "$REPO" != "." ] && [ ! -d Collabo ]; then
  sudo apt-get install -y -qq git 2>/dev/null || true
  git clone "$REPO" Collabo && cd Collabo
fi

echo "[setup] build + run"
docker compose build
docker compose up -d

echo "[setup] pre-pull room app images (arm64, multi-GB, one-time)"
for img in lscr.io/linuxserver/freecad:latest lscr.io/linuxserver/blender:latest; do
  docker pull --platform linux/arm64 "$img" \
    || docker pull "$img" || echo "[warn] $img pull failed — retried at first launch"
done

IP=$(curl -fsS ifconfig.me 2>/dev/null || echo "<vm-ip>")
echo "[done] app at http://$IP:3000 — health: curl http://localhost:3000/health"
echo "[done] features: curl http://localhost:3000/api/features (appStreaming must be true)"
