#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Accave Verilink GRC Platform — EC2 t2.micro setup script
# Run once as root (or with sudo) on a fresh Amazon Linux 2023 instance.
#
# Usage:
#   sudo bash setup.sh --domain grc.yourdomain.com --email you@yourdomain.com
#
# Options:
#   --domain   Your fully-qualified domain name (must already point to this IP)
#   --email    Email address for Let's Encrypt certificate alerts
#   --repo     Git repo URL  (default: https://github.com/Chike2020/mycode)
#   --branch   Git branch    (default: main)
#   --skip-ssl Skip Certbot  (use if domain not yet configured)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parse arguments ───────────────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
REPO="https://github.com/Chike2020/mycode"
BRANCH="main"
SKIP_SSL=false
APP_DIR="/opt/grc-platform"
APP_PORT=3000
NODE_VERSION=22

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)  DOMAIN="$2";    shift 2 ;;
    --email)   EMAIL="$2";     shift 2 ;;
    --repo)    REPO="$2";      shift 2 ;;
    --branch)  BRANCH="$2";    shift 2 ;;
    --skip-ssl) SKIP_SSL=true; shift   ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" && "$SKIP_SSL" == false ]]; then
  echo "ERROR: --domain is required unless --skip-ssl is set."
  echo "       Run:  sudo bash setup.sh --domain grc.example.com --email admin@example.com"
  exit 1
fi

echo "════════════════════════════════════════════════════════════════"
echo "  Accave Verilink GRC Platform — server setup"
echo "  Domain  : ${DOMAIN:-<none>}"
echo "  Repo    : $REPO  ($BRANCH)"
echo "  App dir : $APP_DIR"
echo "════════════════════════════════════════════════════════════════"

# ── 1. System update ──────────────────────────────────────────────────────────
echo ""
echo "[1/8] Updating system packages..."
dnf update -y -q

# ── 2. Node.js ────────────────────────────────────────────────────────────────
echo ""
echo "[2/8] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]]; then
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash - -q
  dnf install -y nodejs -q
fi
node -v && npm -v

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
echo ""
echo "[3/8] Installing PM2..."
npm install -g pm2 -q
pm2 --version

# ── 4. Nginx ─────────────────────────────────────────────────────────────────
echo ""
echo "[4/8] Installing Nginx..."
dnf install -y nginx -q
systemctl enable nginx
systemctl start nginx

# ── 5. Clone / update app ─────────────────────────────────────────────────────
echo ""
echo "[5/8] Deploying application code..."
REPO_DIR="/opt/mycode-repo"

if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch origin "$BRANCH" -q
  git -C "$REPO_DIR" checkout "$BRANCH" -q
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH" -q
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$REPO_DIR" -q
fi

# Copy the app subfolder to its runtime location
rsync -a --exclude='node_modules' --exclude='data' \
  "$REPO_DIR/Accave Verilink GRC Platform/" "$APP_DIR/"

mkdir -p "$APP_DIR/data"
cd "$APP_DIR"
npm install --omit=dev -q

# ── 6. Environment file ───────────────────────────────────────────────────────
echo ""
echo "[6/8] Configuring environment..."
ENV_FILE="$APP_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
PORT=$APP_PORT
JWT_SECRET=$JWT_SECRET
ANTHROPIC_API_KEY=
NODE_ENV=production
EOF
  echo "      .env created with a random JWT_SECRET."
  echo "      Add your ANTHROPIC_API_KEY to $ENV_FILE if you want AI features."
else
  echo "      .env already exists — skipping (edit $ENV_FILE manually if needed)."
fi

chmod 600 "$ENV_FILE"
chown -R ec2-user:ec2-user "$APP_DIR"

# ── 7. PM2 process ───────────────────────────────────────────────────────────
echo ""
echo "[7/8] Starting app with PM2..."
cd "$APP_DIR"
pm2 delete grc-platform 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

# Enable PM2 to start on system boot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u ec2-user --hp /home/ec2-user | tail -1 | bash

# ── 8. Nginx config + optional SSL ───────────────────────────────────────────
echo ""
echo "[8/8] Configuring Nginx..."

NGINX_CONF="/etc/nginx/conf.d/grc-platform.conf"

if [[ -n "$DOMAIN" ]]; then
  cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # Redirect to HTTPS (filled in by Certbot below)
    location / {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 60M;
    }
}
NGINX
else
  # No domain — serve on port 80 by IP
  cat > "$NGINX_CONF" <<NGINX
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 60M;
    }
}
NGINX
fi

nginx -t && systemctl reload nginx

# ── SSL via Certbot ───────────────────────────────────────────────────────────
if [[ "$SKIP_SSL" == false && -n "$DOMAIN" && -n "$EMAIL" ]]; then
  echo ""
  echo "      Installing Certbot and obtaining SSL certificate..."
  dnf install -y python3-certbot-nginx -q
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect \
    --domain "$DOMAIN"
  echo "      SSL certificate installed. Auto-renewal is handled by certbot.timer."
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Setup complete!"
if [[ -n "$DOMAIN" && "$SKIP_SSL" == false ]]; then
  echo "  App is live at : https://$DOMAIN"
else
  PUBIP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "<your-ec2-ip>")
  echo "  App is live at : http://$PUBIP"
  echo "  (Run with --domain and --email once DNS is pointed here to enable HTTPS)"
fi
echo ""
echo "  Useful commands:"
echo "    pm2 logs grc-platform      — live log tail"
echo "    pm2 status                 — process status"
echo "    pm2 restart grc-platform   — restart app"
echo "    cat $ENV_FILE     — view / edit env vars"
echo "════════════════════════════════════════════════════════════════"
