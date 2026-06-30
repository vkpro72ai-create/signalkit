#!/usr/bin/env bash
# ── hetzner-bootstrap.sh ──────────────────────────────────────────────────────
# One-time setup script for a fresh Hetzner VPS.
# Run as root on Ubuntu 22.04 / 24.04.
#
# What it does:
#   1. Updates system packages
#   2. Installs Docker + Docker Compose plugin
#   3. Creates a non-root deploy user (signalkit)
#   4. Clones the SignalKit repo
#   5. Creates required directories and sets permissions
#
# Usage:
#   ssh root@YOUR_VPS_IP 'bash -s' < scripts/deploy/hetzner-bootstrap.sh
#
# After this script:
#   1. SSH as the signalkit user
#   2. Copy .env.production to /home/signalkit/signalkit/
#   3. Run scripts/deploy/deploy.sh

set -euo pipefail

DEPLOY_USER=signalkit
REPO_URL=${REPO_URL:-"https://github.com/vkpro72ai-create/signalkit.git"}
APP_DIR="/home/${DEPLOY_USER}/signalkit"

echo "==> Updating system packages"
apt-get update -q
apt-get upgrade -y -q

echo "==> Installing prerequisites"
apt-get install -y -q \
  ca-certificates \
  curl \
  gnupg \
  git \
  ufw \
  fail2ban

echo "==> Installing Docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -q
apt-get install -y -q \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

systemctl enable --now docker

echo "==> Creating deploy user: ${DEPLOY_USER}"
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

echo "==> Cloning repository"
if [ ! -d "${APP_DIR}" ]; then
  git clone "${REPO_URL}" "${APP_DIR}"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"
fi

echo "==> Creating export storage directory"
mkdir -p /var/lib/signalkit/exports
# Will be managed via Docker named volume, but host dir for bind-mount fallback
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /var/lib/signalkit

echo "==> Creating Caddy log directory"
mkdir -p /var/log/caddy
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /var/log/caddy

echo "==> Configuring UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Enabling fail2ban"
systemctl enable --now fail2ban

echo ""
echo "Bootstrap complete."
echo ""
echo "Next steps:"
echo "  1. ssh ${DEPLOY_USER}@YOUR_VPS_IP"
echo "  2. cd ${APP_DIR}"
echo "  3. cp .env.production.example .env.production"
echo "  4. nano .env.production   # fill in all required values"
echo "  5. bash scripts/deploy/deploy.sh"
