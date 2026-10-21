#!/usr/bin/env bash
# Pull the latest code, rebuild and restart. Usage: sudo bash /opt/paperless/deploy/update.sh
set -euo pipefail
APP=/opt/paperless
sudo -u paperless bash -c "cd $APP && git pull --ff-only && npm ci --no-audit --no-fund && npm run build"
systemctl restart paperless
echo "Updated to $(git -C $APP log --oneline -1)"
