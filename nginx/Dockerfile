# ══════════════════════════════════════════════════════════════════════
# Stage 1 — Build the React SPA
# Build context = project ROOT: docker build -f nginx/Dockerfile .
# --platform=linux/amd64 ensures the Node binary matches the target
# server even when building on Apple Silicon.
# ══════════════════════════════════════════════════════════════════════
FROM --platform=linux/amd64 node:20-alpine AS frontend-build

WORKDIR /app

# ── Install JS dependencies ───────────────────────────────────────────
# Copy only package.json first so this layer is cached on source changes
COPY frontend/package.json ./
RUN npm install --legacy-peer-deps

# ── Copy sources and build ────────────────────────────────────────────
# Fonts are bundled via @fontsource npm packages — no wget/curl needed.
COPY frontend/ .
RUN npm run build

# ══════════════════════════════════════════════════════════════════════
# Stage 2 — Production nginx image (no Node runtime, ~25 MB)
# ══════════════════════════════════════════════════════════════════════
FROM --platform=linux/amd64 nginx:1.27-alpine

LABEL maintainer="Bxdc.ai" \
      description="Bxdc.ai frontend + nginx reverse proxy" \
      arch="x86_64"

RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1
