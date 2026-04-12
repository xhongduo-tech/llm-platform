"""
OpenAI-compatible API proxy with:
  - API key validation
  - Model format conversion / parameter sanitisation
  - Streaming (SSE) passthrough
  - Usage logging
"""
from __future__ import annotations

import json
import time
from typing import Any, AsyncGenerator, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.auth import extract_bearer, validate_api_key
from app.database import get_db
from app.models import ModelRegistryORM, UsageLogORM

router = APIRouter(prefix="/v1", tags=["proxy"])

# ── Model format adapters ──────────────────────────────────────────────────

# Parameters that are NOT supported by llama.cpp / most local backends.
# Stripping them avoids 400 errors from the upstream server.
_STRIP_PARAMS = {
    "logit_bias", "user", "suffix", "best_of", "echo",
    "logprobs", "service_tier", "store", "metadata",
    "parallel_tool_calls", "seed",        # seed is sometimes unsupported
    "response_format",                    # handled selectively below
}

# Per-model param overrides  {model_id: {param: value}}
_MODEL_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "bge-m3":              {"encoding_format": "float"},
    "bge-reranker":        {},
    "qwen3-embedding-8b":  {"encoding_format": "float"},
    "qwen3-vl-embedding-2b": {"encoding_format": "float"},
}


def adapt_request(body: dict, model_record: ModelRegistryORM) -> dict:
    """
    Normalise an incoming OpenAI-format request body for the upstream backend.
    Handles:
      - model name remapping (UI name → backend model_api_name)
      - stripping unsupported parameters
      - per-model overrides
      - multimodal content normalisation
    """
    out = dict(body)

    # Remap model name
    if model_record.model_api_name:
        out["model"] = model_record.model_api_name

    # Strip unsupported params
    for p in _STRIP_PARAMS:
        out.pop(p, None)

    # Apply per-model overrides
    overrides = _MODEL_OVERRIDES.get(model_record.id, {})
    out.update(overrides)

    # Sanitise max_tokens — some backends use max_tokens, others max_new_tokens
    if "max_tokens" in out and out["max_tokens"] is None:
        del out["max_tokens"]

    # For non-vision models, strip image_url content blocks
    if model_record.category not in ("vision", "flagship"):
        messages = out.get("messages", [])
        for msg in messages:
            if isinstance(msg.get("content"), list):
                msg["content"] = " ".join(
                    c.get("text", "")
                    for c in msg["content"]
                    if c.get("type") == "text"
                )

    return out


def build_upstream_headers(model_record: ModelRegistryORM) -> dict:
    """Build headers for the upstream model server."""
    headers = {"Content-Type": "application/json"}

    # Use the model's own API key if set, otherwise omit auth
    if model_record.api_key:
        headers["Authorization"] = f"Bearer {model_record.api_key}"

    # Custom headers (e.g. for proprietary backends)
    if model_record.custom_headers:
        headers.update(model_record.custom_headers)

    return headers


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("/models")
async def list_models(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List available models (OpenAI-compatible)."""
    raw_key = extract_bearer(authorization)
    key_record = validate_api_key(raw_key, "", db)
    allowed = set(key_record.models or [])

    records = db.query(ModelRegistryORM).filter(
        ModelRegistryORM.status == "online"
    ).all()

    data = []
    for r in records:
        if allowed and r.id not in allowed:
            continue
        data.append({
            "id": r.id,
            "object": "model",
            "created": 0,
            "owned_by": r.provider,
        })

    return {"object": "list", "data": data}


@router.post("/chat/completions")
async def chat_completions(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """OpenAI-compatible /v1/chat/completions proxy."""
    raw_key = extract_bearer(authorization)
    body: dict = await request.json()
    model_id: str = body.get("model", "")

    key_record = validate_api_key(raw_key, model_id, db)
    model_record: Optional[ModelRegistryORM] = db.query(ModelRegistryORM).get(model_id)

    if model_record is None or model_record.status not in ("online", "exclusive", "unstable"):
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not available")

    if not model_record.base_url:
        raise HTTPException(status_code=503, detail=f"Model '{model_id}' has no upstream URL configured")

    adapted = adapt_request(body, model_record)
    upstream_url = f"{model_record.base_url.rstrip('/')}/v1/chat/completions"
    headers = build_upstream_headers(model_record)
    is_stream = adapted.get("stream", False)

    start = time.monotonic()

    if is_stream:
        return StreamingResponse(
            _stream_proxy(upstream_url, headers, adapted, key_record.id, model_id, db, start),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",   # disable nginx buffering for SSE
            },
        )
    else:
        return await _json_proxy(upstream_url, headers, adapted, key_record.id, model_id, db, start)


@router.post("/embeddings")
async def embeddings(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """OpenAI-compatible /v1/embeddings proxy."""
    raw_key = extract_bearer(authorization)
    body: dict = await request.json()
    model_id: str = body.get("model", "")

    key_record = validate_api_key(raw_key, model_id, db)
    model_record: Optional[ModelRegistryORM] = db.query(ModelRegistryORM).get(model_id)

    if model_record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    adapted = adapt_request(body, model_record)
    upstream_url = f"{model_record.base_url.rstrip('/')}/v1/embeddings"
    headers = build_upstream_headers(model_record)

    start = time.monotonic()
    return await _json_proxy(upstream_url, headers, adapted, key_record.id, model_id, db, start)


# ── Internal proxy helpers ─────────────────────────────────────────────────

import logging as _logging
_proxy_log = _logging.getLogger(__name__)


async def _json_proxy(
    url: str,
    headers: dict,
    body: dict,
    key_id: str,
    model_id: str,
    db: Session,
    start: float,
) -> JSONResponse:
    model_api_name = body.get("model", model_id)
    async with httpx.AsyncClient(timeout=300) as client:
        try:
            resp = await client.post(url, headers=headers, json=body)
        except httpx.RequestError as e:
            _proxy_log.error(
                "Upstream connection error | model=%s upstream_model=%s url=%s error=%s",
                model_id, model_api_name, url, e,
            )
            raise HTTPException(status_code=502, detail=f"上游服务器连接失败: {e}")

    latency_ms = int((time.monotonic() - start) * 1000)

    try:
        resp_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    except Exception:
        resp_body = {}

    if resp.status_code != 200:
        _proxy_log.warning(
            "Upstream non-200 | model=%s upstream_model=%s url=%s status=%d latency=%dms body=%s",
            model_id, model_api_name, url, resp.status_code, latency_ms,
            str(resp_body)[:300],
        )
        # Return platform-friendly error for common upstream issues
        if resp.status_code == 404:
            hint = (
                f"上游服务器返回 404。请检查：① base_url 是否正确（当前：{url.rsplit('/v1/', 1)[0]}）"
                f"② model_api_name 是否与上游实际模型名一致（当前转发名称：{model_api_name}）"
            )
            resp_body = {"error": {"message": hint, "type": "upstream_404", "model": model_id}}
        elif resp.status_code == 401:
            resp_body = {"error": {"message": "上游服务器鉴权失败，请检查模型的 API Key 配置", "type": "upstream_auth"}}
        elif resp.status_code == 503:
            resp_body = {"error": {"message": "上游推理服务暂不可用，请稍后重试", "type": "upstream_unavailable"}}

    _log_usage(db, key_id, model_id, resp_body, resp.status_code, latency_ms)
    return JSONResponse(content=resp_body, status_code=resp.status_code)


async def _stream_proxy(
    url: str,
    headers: dict,
    body: dict,
    key_id: str,
    model_id: str,
    db: Session,
    start: float,
) -> AsyncGenerator[bytes, None]:
    total_tokens = 0
    status_code = 200

    async with httpx.AsyncClient(timeout=300) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                status_code = resp.status_code
                async for chunk in resp.aiter_bytes():
                    yield chunk
                    # Try to accumulate token counts from SSE data
                    try:
                        lines = chunk.decode().splitlines()
                        for line in lines:
                            if line.startswith("data:") and "[DONE]" not in line:
                                data = json.loads(line[5:].strip())
                                usage = data.get("usage") or {}
                                if usage.get("total_tokens"):
                                    total_tokens = usage["total_tokens"]
                    except Exception:
                        pass
        except httpx.RequestError as e:
            _proxy_log.error("Upstream stream error | model=%s url=%s error=%s", model_id, url, e)
            error_payload = json.dumps({"error": {"message": f"上游服务器连接失败: {e}", "type": "upstream_error"}})
            yield f"data: {error_payload}\n\ndata: [DONE]\n\n".encode()
            status_code = 502

    latency_ms = int((time.monotonic() - start) * 1000)
    _log_usage(db, key_id, model_id, {"usage": {"total_tokens": total_tokens}}, status_code, latency_ms)


def _log_usage(
    db: Session,
    key_id: str,
    model_id: str,
    resp_body: dict,
    status_code: int,
    latency_ms: int,
) -> None:
    try:
        usage = resp_body.get("usage") or {}
        log = UsageLogORM(
            api_key_id=key_id,
            model_id=model_id,
            prompt_tokens=str(usage.get("prompt_tokens", "")),
            completion_tokens=str(usage.get("completion_tokens", "")),
            total_tokens=str(usage.get("total_tokens", "")),
            latency_ms=str(latency_ms),
            status_code=str(status_code),
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
