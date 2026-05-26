#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Accave Verilink GRC Platform — zero-downtime re-deploy script
# Run this on the EC2 instance whenever you push new code.
#
# Usage:  bash deploy.sh [--branch main]
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="${1:-main}"
REPO_DIR="/opt/mycode-repo"
APP_DIR="/opt/grc-platform"

echo "[1/4] Pulling latest code from branch: $BRANCH"
git -C "$REPO_DIR" fetch origin "$BRANCH" -q
git -C "$REPO_DIR" checkout "$BRANCH" -q
git -C "$REPO_DIR" reset --hard "origin/$BRANCH" -q

echo "[2/4] Syncing app files..."
rsync -a --exclude='node_modules' --exclude='data' --exclude='.env' \
  "$REPO_DIR/Accave Verilink GRC Platform/" "$APP_DIR/"

echo "[3/4] Installing/updating dependencies..."
cd "$APP_DIR"
npm install --omit=dev -q

echo "[4/4] Reloading PM2 process (zero-downtime)..."
pm2 reload grc-platform --update-env

echo ""
echo "Deploy complete. Run 'pm2 logs grc-platform' to verify."
