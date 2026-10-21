#!/usr/bin/env bash
# One-time setup of PaperLess Campus on a fresh Ubuntu 24.04 EC2 instance (arm64 or x86_64).
# Usage: sudo DOMAIN=yourname.duckdns.org REPO=https://github.com/<owner>/<repo>.git BRANCH=main bash bootstrap.sh
set -euo pipefail
: "${DOMAIN:?set DOMAIN, e.g. yourname.duckdns.org}"
: "${REPO:?set REPO, the git URL}"
BRANCH="${BRANCH:-main}"
APP=/opt/paperless

echo "== swap (2 GB) so npm install/build fits in 1-2 GB RAM"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "== packages: Node 20, Caddy, sqlite3, unattended security updates"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git sqlite3 build-essential debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== app user and code"
id paperless >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/paperless --shell /usr/sbin/nologin paperless
if [ ! -d "$APP/.git" ]; then git clone --branch "$BRANCH" --depth 1 "$REPO" "$APP"; fi
chown -R paperless:paperless "$APP"

echo "== .env (edit afterwards for Amoy keys)"
if [ ! -f "$APP/.env" ]; then
  cat > "$APP/.env" <<ENV
NODE_ENV=production
PORT=4000
TRUST_PROXY=1
JWT_SECRET=$(openssl rand -hex 32)
DB_PATH=/var/lib/paperless/app.sqlite
STORAGE_DIR=/var/lib/paperless/storage
PUBLIC_BASE_URL=https://$DOMAIN
CHAIN_MODE=local
CHAIN_RPC_URL=http://127.0.0.1:8545
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
AMOY_PRIVATE_KEY=
ENV
  chmod 600 "$APP/.env" && chown paperless:paperless "$APP/.env"
fi
mkdir -p /var/lib/paperless/storage /var/backups/paperless && chown -R paperless:paperless /var/lib/paperless /var/backups/paperless

echo "== install + build (a few minutes on a micro instance)"
sudo -u paperless bash -c "cd $APP && npm ci --no-audit --no-fund && npm run build"

echo "== services"
cp "$APP/deploy/paperless.service" "$APP/deploy/paperless-chain.service" /etc/systemd/system/
sed "s/{\$DOMAIN}/$DOMAIN/" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl daemon-reload
if grep -q '^CHAIN_MODE=local' "$APP/.env"; then systemctl enable --now paperless-chain; fi
systemctl enable --now paperless
systemctl reload caddy || systemctl restart caddy

echo "== nightly backup at 02:30"
cp "$APP/deploy/backup.sh" /usr/local/bin/paperless-backup && chmod +x /usr/local/bin/paperless-backup
echo '30 2 * * * root /usr/local/bin/paperless-backup' > /etc/cron.d/paperless-backup

echo "Done. Open https://$DOMAIN (first certificate can take a minute). Seed the demo: sudo -u paperless bash -c 'cd $APP && set -a && . ./.env && npm run seed:demo'"
