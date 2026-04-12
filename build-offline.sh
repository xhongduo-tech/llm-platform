#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  build-offline.sh — Build all Docker images and export to .tar.gz       ║
# ║                                                                          ║
# ║  Run on a machine WITH internet access (Mac or Linux).                   ║
# ║  Transfer offline-images/ to the air-gapped x86_64 intranet server.     ║
# ║                                                                          ║
# ║  Usage:                                                                  ║
# ║    chmod +x build-offline.sh && ./build-offline.sh                       ║
# ╚══════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/offline-images"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Prerequisites ──────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker not found."
docker info >/dev/null 2>&1       || error "Docker daemon not running."

info "Target platform: linux/amd64 (x86_64)"
info "Build host:      $(uname -m) / $(uname -s)"
echo ""

# ── Ensure buildx is available and set up an amd64-capable builder ─────────
# On Mac (Apple Silicon) the default builder cannot produce amd64 images
# without QEMU emulation. docker buildx handles this transparently.
if ! docker buildx version >/dev/null 2>&1; then
    error "docker buildx not available. Please update Docker Desktop to 4.x+."
fi

BUILDER="bxdc-amd64-builder"
if ! docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
    info "Creating buildx builder '${BUILDER}' (first run only)..."
    docker buildx create --name "${BUILDER}" --driver docker-container \
        --driver-opt image=moby/buildkit:latest --use
    docker buildx inspect --bootstrap "${BUILDER}"
    success "Builder created."
else
    docker buildx use "${BUILDER}"
    info "Using existing buildx builder '${BUILDER}'."
fi

# ── Step 1: Build backend image ────────────────────────────────────────────
info "Building backend image (bxdc-backend:latest) → linux/amd64..."
docker buildx build \
    --platform linux/amd64 \
    --load \
    -t bxdc-backend:latest \
    "${SCRIPT_DIR}/backend"
success "Backend image built."

# ── Step 2: Build nginx + frontend image ──────────────────────────────────
info "Building nginx+frontend image (bxdc-nginx:latest) → linux/amd64..."
info "  This step: npm install + Google Fonts download + npm build + nginx packaging"
info "  Estimated time: 5-10 min on first build, ~2 min with cache."
docker buildx build \
    --platform linux/amd64 \
    --load \
    -t bxdc-nginx:latest \
    -f "${SCRIPT_DIR}/nginx/Dockerfile" \
    "${SCRIPT_DIR}"
success "Nginx+frontend image built."

# ── Step 3: Export to compressed tar archives ─────────────────────────────
mkdir -p "${OUTPUT_DIR}/nginx"

info "Exporting images (this may take 1-2 minutes)..."

docker save bxdc-backend:latest | gzip > "${OUTPUT_DIR}/bxdc-backend.tar.gz"
success "Backend:  $(du -sh "${OUTPUT_DIR}/bxdc-backend.tar.gz" | cut -f1)"

docker save bxdc-nginx:latest | gzip > "${OUTPUT_DIR}/bxdc-nginx.tar.gz"
success "Nginx:    $(du -sh "${OUTPUT_DIR}/bxdc-nginx.tar.gz" | cut -f1)"

# ── Step 4: Bundle deployment helpers ─────────────────────────────────────
cp "${SCRIPT_DIR}/docker-compose.yml"  "${OUTPUT_DIR}/docker-compose.yml"
cp "${SCRIPT_DIR}/.env.example"        "${OUTPUT_DIR}/.env.example"
cp "${SCRIPT_DIR}/deploy-offline.sh"   "${OUTPUT_DIR}/deploy-offline.sh"
cp "${SCRIPT_DIR}/nginx/nginx.conf"    "${OUTPUT_DIR}/nginx/nginx.conf"
chmod +x "${OUTPUT_DIR}/deploy-offline.sh"
success "Deployment files bundled."

# ── Step 5: Verify ────────────────────────────────────────────────────────
info "Verifying archives..."
gzip -t "${OUTPUT_DIR}/bxdc-backend.tar.gz" && success "  bxdc-backend.tar.gz OK"
gzip -t "${OUTPUT_DIR}/bxdc-nginx.tar.gz"   && success "  bxdc-nginx.tar.gz OK"

# ── Done ──────────────────────────────────────────────────────────────────
TOTAL="$(du -sh "${OUTPUT_DIR}" | cut -f1)"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Build complete!  Total size: ${TOTAL}                        ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Transfer to server:                                         ║${NC}"
echo -e "${GREEN}║    scp -r offline-images/ user@INTRANET_SERVER:/opt/bxdc/   ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Then on the server:                                         ║${NC}"
echo -e "${GREEN}║    cd /opt/bxdc/offline-images                              ║${NC}"
echo -e "${GREEN}║    chmod +x deploy-offline.sh && ./deploy-offline.sh        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
