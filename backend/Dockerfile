# ── Stage 1: install Python deps ──────────────────────────────────────────
FROM --platform=linux/amd64 python:3.11-slim AS deps

WORKDIR /install
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/deps -r requirements.txt

# ── Stage 2: runtime image ─────────────────────────────────────────────────
FROM --platform=linux/amd64 python:3.11-slim

LABEL maintainer="Bxdc.ai" \
      description="Bxdc.ai API gateway backend" \
      arch="x86_64"

COPY --from=deps /deps /usr/local

WORKDIR /app
COPY . .

RUN mkdir -p /data && chmod 777 /data

EXPOSE 8000

ENV DB_PATH=/data/bxdc.db \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
