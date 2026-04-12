#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  deploy-offline.sh — Load images and start Bxdc.ai on the intranet     ║
# ║                      server (no internet access required)                ║
# ║                                                                          ║
# ║  This script is bundled into offline-images/ by build-offline.sh.       ║
# ║  Copy the entire offline-images/ directory to the server, then run:     ║
# ║                                                                          ║
# ║    cd offline-images                                                     ║
# ║    chmod +x deploy-offline.sh                                            ║
# ║    sudo ./deploy-offline.sh                                              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Prerequisites ──────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1          || error "Docker not found. Please install Docker CE on this server first."
docker info >/dev/null 2>&1                || error "Docker daemon is not running. Run: sudo systemctl start docker"
command -v docker >/dev/null 2>&1
# docker compose (v2) or docker-compose (v1)
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    error "Neither 'docker compose' (v2) nor 'docker-compose' (v1) found."
fi

info "Bxdc.ai offline deployment"
info "Working directory: ${SCRIPT_DIR}"
echo ""

# ── Step 1: Load images from tar archives ──────────────────────────────────
for img in bxdc-backend.tar.gz bxdc-nginx.tar.gz; do
    if [ ! -f "${SCRIPT_DIR}/${img}" ]; then
        error "Image archive not found: ${img}"
    fi
    info "Loading ${img}..."
    docker load < "${SCRIPT_DIR}/${img}"
    success "  Loaded: ${img}"
done

# ── Step 2: Prepare environment ────────────────────────────────────────────
cd "${SCRIPT_DIR}"

if [ ! -f ".env" ]; then
    warn ".env not found. Copying from .env.example..."
    cp .env.example .env
    warn "IMPORTANT: Edit .env and set a strong JWT_SECRET before continuing!"
    warn "  nano .env  (or vi .env)"
    read -rp "Press ENTER to continue with default values, or Ctrl+C to edit first: "
fi

# ── Step 3: Start services ─────────────────────────────────────────────────
info "Starting Bxdc.ai services..."
$COMPOSE up -d

# ── Step 4: Wait for health checks ────────────────────────────────────────
info "Waiting for services to become healthy (up to 60s)..."
ELAPSED=0
until $COMPOSE ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || [ $ELAPSED -ge 60 ]; do
    sleep 3; ELAPSED=$((ELAPSED+3))
    echo -n "."
done
echo ""

# ── Step 5: Summary ────────────────────────────────────────────────────────
$COMPOSE ps

# Detect server IP
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_SERVER_IP")"
HTTP_PORT="$(grep HTTP_PORT .env 2>/dev/null | cut -d= -f2 || echo "80")"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Bxdc.ai is running!                                         ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
printf    "${GREEN}║  Web UI:     http://%-42s ║${NC}\n" "${SERVER_IP}:${HTTP_PORT}"
printf    "${GREEN}║  API docs:   http://%-42s ║${NC}\n" "${SERVER_IP}:${HTTP_PORT}/api/docs"
printf    "${GREEN}║  Health:     http://%-42s ║${NC}\n" "${SERVER_IP}:${HTTP_PORT}/health"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Next steps:                                                 ║${NC}"
echo -e "${GREEN}║  1. Open the web UI and navigate to /admin                  ║${NC}"
echo -e "${GREEN}║  2. Login with ADMIN_PASSWORD from .env (default: 990115)   ║${NC}"
echo -e "${GREEN}║  3. Add model endpoints in the Models tab                   ║${NC}"
echo -e "${GREEN}║  4. Generate API keys in the Users tab                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
info "To stop:    $COMPOSE down"
info "To restart: $COMPOSE restart"
info "To view logs: $COMPOSE logs -f"
