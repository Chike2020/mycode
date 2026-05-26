#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Zero-downtime re-deploy script
# Run on the EC2 instance after pushing new code to GitHub.
#
# Usage:
#   bash deploy.sh            — redeploy ALL apps
#   bash deploy.sh accave     — redeploy Accave Verilink only
#   bash deploy.sh shepherd   — redeploy Shepherd GRC only
#   bash deploy.sh primum     — redeploy Primum GRC only
#   bash deploy.sh lexsec     — sync LexSec static site only
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TARGET="${1:-all}"
BRANCH="main"
REPO_DIR="/opt/mycode-repo"
SITES_DIR="/opt/sites"
LEXSEC_WEB="/var/www/lexsec"

log() { echo ""; echo "──── $*"; }
ok()  { echo "  ✓ $*"; }

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code (branch: $BRANCH)"
git -C "$REPO_DIR" fetch origin "$BRANCH" -q
git -C "$REPO_DIR" checkout "$BRANCH" -q
git -C "$REPO_DIR" reset --hard "origin/$BRANCH" -q
ok "Repository up to date"

# ── Helper: sync + reload one Node.js app ────────────────────────────────────
deploy_app() {
  local name="$1"   # pm2 app name
  local src="$2"    # source path in repo
  local dest="$3"   # destination in /opt/sites

  log "Deploying $name"
  rsync -a --exclude='node_modules' --exclude='data' --exclude='.env' \
    "$src/" "$dest/"
  cd "$dest"
  npm install --omit=dev -q
  pm2 reload "$name" --update-env
  ok "$name reloaded"
}

# ── Deploy selected targets ───────────────────────────────────────────────────
case "$TARGET" in
  accave|all)
    deploy_app "accave-verilink" \
      "$REPO_DIR/Accave Verilink GRC Platform" \
      "$SITES_DIR/accave"
    ;;&   # fall through if "all"

  shepherd|all)
    if [[ -d "$REPO_DIR/shepherd-grc" ]]; then
      deploy_app "shepherd-grc" \
        "$REPO_DIR/shepherd-grc" \
        "$SITES_DIR/shepherd"
    else
      ok "Shepherd GRC: no code in repo yet — skipping"
    fi
    ;;&

  primum|all)
    if [[ -d "$REPO_DIR/primum-grc" ]]; then
      deploy_app "primum-grc" \
        "$REPO_DIR/primum-grc" \
        "$SITES_DIR/primum"
    else
      ok "Primum GRC: no code in repo yet — skipping"
    fi
    ;;&

  lexsec|all)
    log "Syncing LexSec static site"
    rsync -a "$REPO_DIR/lexsec-site/" "$LEXSEC_WEB/"
    ok "LexSec static files updated"
    ;;
esac

echo ""
echo "════════════════════════════════════════"
echo "  Deploy complete."
echo "  pm2 status  →  check all processes"
echo "════════════════════════════════════════"
