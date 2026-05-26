#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Multi-site EC2 setup — LexSec Advisory + Accave Verilink + Shepherd + Primum
# Target OS : Amazon Linux 2023 (t2.micro, Free Tier)
# Run once  : sudo bash setup.sh
#
# What it does:
#   1. Updates system packages
#   2. Installs Node.js 22, PM2, Nginx, Certbot
#   3. Creates directory structure for all 4 sites
#   4. Deploys code from GitHub
#   5. Generates .env files with random JWT secrets
#   6. Starts all Node.js apps with PM2
#   7. Writes Nginx virtual-host config for all 4 domains
#   8. Obtains Let's Encrypt SSL certs via Cloudflare DNS (or HTTP challenge)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config — edit these before running ───────────────────────────────────────
DOMAIN_LEXSEC="lexsecadvisory.com"
DOMAIN_ACCAVE="accaveverilink.com"
DOMAIN_SHEPHERD="shepherdgrc.com"
DOMAIN_PRIMUM="primumgrc.com"
CERTBOT_EMAIL="admin@lexsecadvisory.com"   # change to your real email

REPO="https://github.com/Chike2020/mycode"
BRANCH="main"

PORT_ACCAVE=3000
PORT_SHEPHERD=3001
PORT_PRIMUM=3002

REPO_DIR="/opt/mycode-repo"
SITES_DIR="/opt/sites"
LEXSEC_WEB="/var/www/lexsec"

SKIP_SSL="${SKIP_SSL:-false}"   # set SKIP_SSL=true to skip Certbot
# ─────────────────────────────────────────────────────────────────────────────

log()  { echo ""; echo "──── $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }

echo "════════════════════════════════════════════════════════════════"
echo "  Multi-site EC2 setup"
echo "  LexSec Advisory  : $DOMAIN_LEXSEC (static)"
echo "  Accave Verilink  : $DOMAIN_ACCAVE  → port $PORT_ACCAVE"
echo "  Shepherd GRC     : $DOMAIN_SHEPHERD → port $PORT_SHEPHERD"
echo "  Primum GRC       : $DOMAIN_PRIMUM   → port $PORT_PRIMUM"
echo "════════════════════════════════════════════════════════════════"

# ── 1. System update ──────────────────────────────────────────────────────────
log "1/8  Updating system packages"
dnf update -y -q
ok "System up to date"

# ── 2. Node.js 22 ─────────────────────────────────────────────────────────────
log "2/8  Installing Node.js 22"
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - -q
  dnf install -y nodejs -q
fi
ok "Node $(node -v)  /  npm $(npm -v)"

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
log "3/8  Installing PM2"
npm install -g pm2 -q
ok "PM2 $(pm2 -v)"

# ── 4. Nginx + Certbot ────────────────────────────────────────────────────────
log "4/8  Installing Nginx and Certbot"
dnf install -y nginx python3-certbot-nginx -q
systemctl enable nginx
systemctl start nginx
ok "Nginx $(nginx -v 2>&1 | grep -o '[0-9.]*')"

# ── 5. Clone / update repo ────────────────────────────────────────────────────
log "5/8  Cloning repository"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch origin "$BRANCH" -q
  git -C "$REPO_DIR" checkout "$BRANCH" -q
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH" -q
  ok "Repo updated"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$REPO_DIR" -q
  ok "Repo cloned"
fi

# ── 6. Deploy each site ───────────────────────────────────────────────────────
log "6/8  Deploying site files"

mkdir -p "$SITES_DIR/accave" "$SITES_DIR/shepherd" "$SITES_DIR/primum" "$LEXSEC_WEB"
mkdir -p /var/log/grc-platform

# LexSec — static site
rsync -a "$REPO_DIR/lexsec-site/" "$LEXSEC_WEB/"
ok "LexSec static files → $LEXSEC_WEB"

# Accave Verilink
rsync -a --exclude='node_modules' --exclude='data' --exclude='.env' \
  "$REPO_DIR/Accave Verilink GRC Platform/" "$SITES_DIR/accave/"
mkdir -p "$SITES_DIR/accave/data"
cd "$SITES_DIR/accave" && npm install --omit=dev -q
ok "Accave Verilink → $SITES_DIR/accave"

# Shepherd GRC (placeholder until code is ready)
if [[ -d "$REPO_DIR/shepherd-grc" ]]; then
  rsync -a --exclude='node_modules' --exclude='data' --exclude='.env' \
    "$REPO_DIR/shepherd-grc/" "$SITES_DIR/shepherd/"
  mkdir -p "$SITES_DIR/shepherd/data"
  cd "$SITES_DIR/shepherd" && npm install --omit=dev -q
  ok "Shepherd GRC → $SITES_DIR/shepherd"
else
  # Deploy maintenance page as placeholder
  cp "$REPO_DIR/Accave Verilink GRC Platform/deploy/placeholder.html" "$SITES_DIR/shepherd/index.html" 2>/dev/null || \
    echo "<h1>Shepherd GRC — Coming Soon</h1>" > "$SITES_DIR/shepherd/index.html"
  warn "Shepherd GRC: no code found, placeholder deployed"
fi

# Primum GRC (placeholder until code is ready)
if [[ -d "$REPO_DIR/primum-grc" ]]; then
  rsync -a --exclude='node_modules' --exclude='data' --exclude='.env' \
    "$REPO_DIR/primum-grc/" "$SITES_DIR/primum/"
  mkdir -p "$SITES_DIR/primum/data"
  cd "$SITES_DIR/primum" && npm install --omit=dev -q
  ok "Primum GRC → $SITES_DIR/primum"
else
  echo "<h1>Primum GRC — Coming Soon</h1>" > "$SITES_DIR/primum/index.html"
  warn "Primum GRC: no code found, placeholder deployed"
fi

chown -R ec2-user:ec2-user "$SITES_DIR" "$LEXSEC_WEB"

# ── 7. .env files ─────────────────────────────────────────────────────────────
log "7/8  Writing .env files"

write_env() {
  local path="$1" port="$2"
  if [[ ! -f "$path" ]]; then
    printf "PORT=%s\nJWT_SECRET=%s\nANTHROPIC_API_KEY=\nNODE_ENV=production\n" \
      "$port" "$(openssl rand -hex 32)" > "$path"
    chmod 600 "$path"
    ok ".env created → $path"
  else
    warn ".env already exists → $path (not overwritten)"
  fi
}

write_env "$SITES_DIR/accave/.env"   "$PORT_ACCAVE"
write_env "$SITES_DIR/shepherd/.env" "$PORT_SHEPHERD"
write_env "$SITES_DIR/primum/.env"   "$PORT_PRIMUM"

# ── PM2 ──────────────────────────────────────────────────────────────────────
log "8a  Starting apps with PM2"

cp "$REPO_DIR/Accave Verilink GRC Platform/ecosystem.config.js" "$SITES_DIR/ecosystem.config.js"
cd "$SITES_DIR"

pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

env PATH="$PATH:/usr/bin" pm2 startup systemd -u ec2-user --hp /home/ec2-user | tail -1 | bash
ok "PM2 processes running"

# ── Nginx virtual hosts ───────────────────────────────────────────────────────
log "8b  Writing Nginx config"
cp "$REPO_DIR/Accave Verilink GRC Platform/deploy/nginx.conf" /etc/nginx/conf.d/multisite.conf

# Substitute real domain names into the config
sed -i \
  -e "s/DOMAIN_LEXSEC/$DOMAIN_LEXSEC/g" \
  -e "s/DOMAIN_ACCAVE/$DOMAIN_ACCAVE/g" \
  -e "s/DOMAIN_SHEPHERD/$DOMAIN_SHEPHERD/g" \
  -e "s/DOMAIN_PRIMUM/$DOMAIN_PRIMUM/g" \
  /etc/nginx/conf.d/multisite.conf

# Remove the default catch-all so our blocks take precedence
rm -f /etc/nginx/conf.d/default.conf

nginx -t && systemctl reload nginx
ok "Nginx reloaded"

# ── SSL ───────────────────────────────────────────────────────────────────────
if [[ "$SKIP_SSL" != "true" ]]; then
  log "8c  Obtaining SSL certificates (Let's Encrypt)"
  certbot --nginx \
    --non-interactive --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --redirect \
    --domains "$DOMAIN_LEXSEC,www.$DOMAIN_LEXSEC,$DOMAIN_ACCAVE,www.$DOMAIN_ACCAVE,$DOMAIN_SHEPHERD,www.$DOMAIN_SHEPHERD,$DOMAIN_PRIMUM,www.$DOMAIN_PRIMUM"
  ok "SSL certificates installed for all 4 domains"
else
  warn "SKIP_SSL=true — skipping Certbot (run manually later)"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  All done!  Sites are live:"
echo ""
echo "  https://$DOMAIN_LEXSEC     LexSec Advisory (static)"
echo "  https://$DOMAIN_ACCAVE     Accave Verilink GRC"
echo "  https://$DOMAIN_SHEPHERD   Shepherd GRC"
echo "  https://$DOMAIN_PRIMUM     Primum GRC"
echo ""
echo "  Useful commands:"
echo "    pm2 status                  — all process statuses"
echo "    pm2 logs accave-verilink    — Accave log tail"
echo "    pm2 logs shepherd-grc       — Shepherd log tail"
echo "    pm2 logs primum-grc         — Primum log tail"
echo "    bash /opt/mycode-repo/.../deploy/deploy.sh accave"
echo "════════════════════════════════════════════════════════════════"
