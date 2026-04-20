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

# For /v1/completions (FIM), keep suffix/echo/logprobs which are valid fields.
_STRIP_PARAMS_COMPLETIONS = _STRIP_PARAMS - {"suffix", "echo", "logprobs", "best_of"}

# Per-model param overrides  {model_id: {param: value}}
_MODEL_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "bge-m3":              {"encoding_format": "float"},
    "bge-reranker":        {},
    "qwen3-embedding-8b":  {"encoding_format": "float"},
    "qwen3-vl-embedding-2b": {"encoding_format": "float"},
}


def adapt_request(
    body: dict,
    model_record: ModelRegistryORM,
    for_completions: bool = False,
) -> dict:
    """
    Normalise an incoming OpenAI-format request body for the upstream backend.
    Handles:
      - model name remapping (UI name → backend model_api_name)
      - stripping unsupported parameters
      - per-model overrides
      - multimodal content normalisation (chat only)
    """
    out = dict(body)

    # Remap model name
    if model_record.model_api_name:
        out["model"] = model_record.model_api_name

    # Strip unsupported params — completions keeps suffix/echo/logprobs for FIM
    strip_set = _STRIP_PARAMS_COMPLETIONS if for_completions else _STRIP_PARAMS
    for p in strip_set:
        out.pop(p, None)

    # Apply per-model overrides
    overrides = _MODEL_OVERRIDES.get(model_record.id, {})
    out.update(overrides)

    # Sanitise max_tokens — some backends use max_tokens, others max_new_tokens
    if "max_tokens" in out and out["max_tokens"] is None:
        del out["max_tokens"]

    # For non-vision models, strip image_url content blocks (chat only)
    if not for_completions and model_record.category not in ("vision", "flagship"):
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
    # Custom-format models: use base_url verbatim (user supplies the full endpoint URL).
    # OpenAI-format models: append the standard path.
    if model_record.import_format == "custom":
        upstream_url = model_record.base_url
    else:
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
    if model_record.import_format == "custom":
        upstream_url = model_record.base_url
    else:
        upstream_url = f"{model_record.base_url.rstrip('/')}/v1/embeddings"
    headers = build_upstream_headers(model_record)

    start = time.monotonic()
    return await _json_proxy(upstream_url, headers, adapted, key_record.id, model_id, db, start)


@router.post("/completions")
async def completions(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    OpenAI-compatible /v1/completions proxy — supports FIM (Fill-In-the-Middle).

    FIM models (e.g. Qwen2.5-Coder, DeepSeek-Coder) accept a ``suffix`` field
    alongside ``prompt`` to perform code infilling.  The standard chat
    ``/v1/chat/completions`` endpoint does not carry this field, so a dedicated
    text-completions route is required.
    """
    raw_key = extract_bearer(authorization)
    body: dict = await request.json()
    model_id: str = body.get("model", "")

    key_record = validate_api_key(raw_key, model_id, db)
    model_record: Optional[ModelRegistryORM] = db.query(ModelRegistryORM).get(model_id)

    if model_record is None or model_record.status not in ("online", "exclusive", "unstable"):
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not available")

    if not model_record.base_url:
        raise HTTPException(status_code=503, detail=f"Model '{model_id}' has no upstream URL configured")

    adapted = adapt_request(body, model_record, for_completions=True)
    if model_record.import_format == "custom":
        upstream_url = model_record.base_url
    else:
        upstream_url = f"{model_record.base_url.rstrip('/')}/v1/completions"
    headers = build_upstream_headers(model_record)
    is_stream = adapted.get("stream", False)

    start = time.monotonic()

    if is_stream:
        return StreamingResponse(
            _stream_proxy(
                upstream_url, headers, adapted, key_record.id, model_id, db, start,
                is_fim=True,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        return await _json_proxy(
            upstream_url, headers, adapted, key_record.id, model_id, db, start,
            is_fim=True,
        )


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
    is_fim: bool = False,
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

    # Build log extras: error detail for non-200, response preview for 200
    error_detail: Optional[str] = None
    response_preview: Optional[str] = None

    if resp.status_code != 200:
        err = (resp_body.get("error") or {})
        error_detail = (err.get("message") or str(resp_body))[:500]
    else:
        # Collect completion text for preview and usage estimation
        completion_text = ""
        for choice in (resp_body.get("choices") or []):
            if is_fim:
                completion_text += str(choice.get("text") or "")
            else:
                msg = choice.get("message") or {}
                completion_text += str(msg.get("content") or "")

        if completion_text:
            response_preview = completion_text[:500]

        # Fallback usage estimate when upstream omits usage field
        if not (resp_body.get("usage") or {}):
            estimated = _estimate_usage_from_request(body, [completion_text] if completion_text else [], is_fim=is_fim)
            if estimated:
                resp_body = dict(resp_body)
                resp_body["usage"] = estimated

    _log_usage(db, key_id, model_id, resp_body, resp.status_code, latency_ms,
               error_detail=error_detail, response_preview=response_preview)
    return JSONResponse(content=resp_body, status_code=resp.status_code)


def _extract_usage(usage: dict) -> Optional[dict]:
    """
    Normalise a raw usage dict from any upstream API into our standard form.

    Handles multiple field-name conventions:
      - OpenAI / vLLM:  prompt_tokens / completion_tokens / total_tokens
      - Anthropic style: input_tokens  / output_tokens
      - Some open models omit total_tokens and just give the two halves.

    Returns None when the dict is empty or contains no meaningful counts.
    """
    if not usage:
        return None

    prompt     = int(usage.get("prompt_tokens")     or usage.get("input_tokens")  or 0)
    completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    total      = int(usage.get("total_tokens")      or (prompt + completion))

    # Ignore usage dicts where everything is zero (model didn't report counts)
    if total == 0 and prompt == 0 and completion == 0:
        return None

    return {
        "prompt_tokens":     prompt,
        "completion_tokens": completion,
        "total_tokens":      total,
    }


def _estimate_tokens(text: str) -> int:
    """
    Estimate token count WITHOUT a tokenizer library.

    Heuristic rules (conservative but consistent):
      - CJK characters (Chinese / Japanese / Korean + fullwidth punctuation)
        typically tokenise 1-to-1 in modern BPE vocabularies  → count as 1 each
      - Latin / ASCII / other  averages ≈ 4 characters per token              → divide by 4

    This is used ONLY as a fallback when the upstream model doesn't return
    usage statistics in its response (e.g. older vLLM, proprietary APIs).
    Actual counts differ by model; the estimate is typically within ±20 %.
    """
    if not text:
        return 0
    cjk = sum(
        1 for ch in text
        if ('\u4e00' <= ch <= '\u9fff')    # CJK Unified Ideographs (main block)
        or ('\u3400' <= ch <= '\u4dbf')    # CJK Extension A
        or ('\u3000' <= ch <= '\u303f')    # CJK Symbols & Punctuation
        or ('\uff00' <= ch <= '\uffef')    # Fullwidth / Halfwidth forms
        or ('\u0e00' <= ch <= '\u0e7f')    # Thai
    )
    other = len(text) - cjk
    return cjk + max(0, (other + 3) // 4)  # ceiling division for Latin text


def _estimate_usage_from_request(
    request_body: dict,
    completion_chunks: "list[str]",
    is_fim: bool = False,
) -> Optional[dict]:
    """
    Build a fallback usage estimate from the original request messages and the
    accumulated streaming response text.

    Returns None only when both sides yield 0 estimated tokens (e.g. empty
    messages and empty response — almost certainly an error path, not a real
    inference).
    """
    if is_fim:
        # FIM / text completions: prompt is a plain string + optional suffix
        prompt_text = str(request_body.get("prompt") or "")
        suffix_text = str(request_body.get("suffix") or "")
        if suffix_text:
            prompt_text = prompt_text + " " + suffix_text
    else:
        # --- prompt: concatenate all message content strings ----------------
        prompt_parts: list[str] = []
        for msg in (request_body.get("messages") or []):
            content = msg.get("content") or ""
            if isinstance(content, list):
                # multimodal: extract text blocks only
                content = " ".join(
                    block.get("text", "")
                    for block in content
                    if isinstance(block, dict) and block.get("type") == "text"
                )
            prompt_parts.append(str(content))
        prompt_text = " ".join(prompt_parts)

    # --- completion: join all streamed delta chunks -------------------------
    completion_text = "".join(completion_chunks)

    est_prompt     = _estimate_tokens(prompt_text)
    est_completion = _estimate_tokens(completion_text)

    if est_prompt == 0 and est_completion == 0:
        return None

    return {
        "prompt_tokens":     est_prompt,
        "completion_tokens": est_completion,
        "total_tokens":      est_prompt + est_completion,
    }


async def _stream_proxy(
    url: str,
    headers: dict,
    body: dict,
    key_id: str,
    model_id: str,
    db: Session,
    start: float,
    is_fim: bool = False,
) -> AsyncGenerator[bytes, None]:
    # Ask the upstream to include usage in the final SSE chunk.
    # vLLM ≥ 0.3 and most OpenAI-compatible servers honour this flag.
    stream_body = dict(body)
    stream_body["stream_options"] = dict(stream_body.get("stream_options") or {})
    stream_body["stream_options"]["include_usage"] = True

    usage: dict = {}
    status_code = 200

    # SSE line buffer — raw TCP/HTTP chunks may not align with SSE event
    # boundaries.  Buffer incomplete data across yields so we never miss a
    # usage payload that was split across two consecutive aiter_bytes() calls.
    sse_buf = ""

    # Accumulate streamed content for token estimation fallback.
    # Used when the upstream doesn't return a usage object at all (e.g. older
    # vLLM versions, proprietary backends that omit usage stats).
    completion_chunks: list[str] = []

    async with httpx.AsyncClient(timeout=300) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=stream_body) as resp:
                status_code = resp.status_code
                async for chunk in resp.aiter_bytes():
                    yield chunk
                    # Accumulate into the line buffer and process complete lines.
                    try:
                        sse_buf += chunk.decode(errors="replace")
                        # Process every complete line (terminated by \n).
                        # Leave any trailing incomplete fragment in the buffer.
                        while "\n" in sse_buf:
                            line, sse_buf = sse_buf.split("\n", 1)
                            line = line.rstrip("\r")
                            if not line.startswith("data:") or "[DONE]" in line:
                                continue
                            data = json.loads(line[5:].strip())

                            # ① Try to get usage reported by the upstream
                            raw_usage = data.get("usage") or {}
                            if not raw_usage:
                                # Some backends nest it under choices[0].delta
                                choices = data.get("choices") or []
                                if choices:
                                    raw_usage = (choices[0].get("delta") or {}).get("usage") or {}
                            normalised = _extract_usage(raw_usage)
                            if normalised:
                                usage = normalised   # keep the last non-zero snapshot

                            # ② Collect delta content for fallback estimation
                            for choice in (data.get("choices") or []):
                                if is_fim:
                                    # text completions stream: content in choice.text
                                    piece = choice.get("text") or ""
                                else:
                                    piece = (choice.get("delta") or {}).get("content") or ""
                                if piece:
                                    completion_chunks.append(piece)
                    except Exception:
                        pass  # malformed / incomplete JSON — handled on next iteration
        except httpx.RequestError as e:
            _proxy_log.error("Upstream stream error | model=%s url=%s error=%s", model_id, url, e)
            error_payload = json.dumps({"error": {"message": f"上游服务器连接失败: {e}", "type": "upstream_error"}})
            yield f"data: {error_payload}\n\ndata: [DONE]\n\n".encode()
            status_code = 502

    # If the upstream never returned usage stats, fall back to an estimate
    # derived from the actual content so we never log zeros for a real call.
    if not usage and status_code == 200:
        estimated = _estimate_usage_from_request(body, completion_chunks, is_fim=is_fim)
        if estimated:
            usage = estimated
            _proxy_log.debug(
                "Usage estimated (upstream silent) | model=%s ~prompt=%d ~completion=%d",
                model_id, estimated["prompt_tokens"], estimated["completion_tokens"],
            )

    # Build log extras from accumulated stream content
    stream_error_detail: Optional[str] = None
    stream_response_preview: Optional[str] = None
    if status_code != 200:
        stream_error_detail = f"上游返回状态码 {status_code}"
    elif completion_chunks:
        stream_response_preview = "".join(completion_chunks)[:500]

    latency_ms = int((time.monotonic() - start) * 1000)
    _log_usage(db, key_id, model_id, {"usage": usage}, status_code, latency_ms,
               error_detail=stream_error_detail, response_preview=stream_response_preview)


def _log_usage(
    db: Session,
    key_id: str,
    model_id: str,
    resp_body: dict,
    status_code: int,
    latency_ms: int,
    error_detail: Optional[str] = None,
    response_preview: Optional[str] = None,
) -> None:
    try:
        raw_usage = resp_body.get("usage") or {}
        normalised = _extract_usage(raw_usage) or {}
        log = UsageLogORM(
            api_key_id=key_id,
            model_id=model_id,
            prompt_tokens=str(normalised.get("prompt_tokens", "")),
            completion_tokens=str(normalised.get("completion_tokens", "")),
            total_tokens=str(normalised.get("total_tokens", "")),
            latency_ms=str(latency_ms),
            status_code=str(status_code),
            error_detail=error_detail,
            response_preview=response_preview,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
