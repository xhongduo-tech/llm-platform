# ── Stage 1: build the React SPA ──────────────────────────────────────────
FROM node:20-alpine AS builder

LABEL stage="frontend-build"

WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package.json ./
# Use npm with legacy-peer-deps to handle the peerDep setup in this project
RUN npm install --legacy-peer-deps

# Copy sources and build
COPY . .
RUN npm run build

# ── Stage 2: standalone nginx serving the built SPA ───────────────────────
# (Only used when building the frontend image independently.
#  The main docker-compose uses the nginx/ Dockerfile which copies from above.)
FROM nginx:1.27-alpine AS standalone

RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Minimal single-server nginx config for standalone use
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript;\n\
    location / { try_files $uri $uri/ /index.html; }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
