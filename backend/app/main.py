"""
Bxdc.ai Backend — FastAPI application entry point.

Exposes:
  /api/admin/*   — admin management (models, keys, notifications)
  /api/apply     — public application submission
  /v1/*          — OpenAI-compatible proxy (chat, embeddings, models)
  /health        — liveness probe for Docker / nginx upstream checks
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.auth import (
    ADMIN_PASSWORD,
    JWT_SECRET,
    JWT_ALGORITHM,
    create_admin_token,
    verify_admin_token,
    create_user_token,
    verify_user_token,
    verify_user_token_optional,
    hash_password,
    verify_password,
)
from app.database import get_db, init_db
from app.models import (
    AdminLoginIn,
    ApiKeyCreate,
    ApiKeyORM,
    ApiKeyOut,
    ApplicationIn,
    ApplicationORM,
    BulkSyncIn,
    ForumPostORM,
    ForumReplyORM,
    ModelRegistryORM,
    NotificationORM,
    UsageLogORM,
    UserORM,
)
from app.proxy import router as proxy_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(
    title="Bxdc.ai API Gateway",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS — allow the frontend origin (nginx serves both, but be safe) ──────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount OpenAI-compatible proxy
app.include_router(proxy_router)


@app.on_event("startup")
def startup():
    init_db()
    log.info("Database initialised at %s", os.getenv("DB_PATH", "/data/bxdc.db"))
    _migrate_remove_stale_models()
    _seed_models_if_empty()


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health", tags=["infra"])
def health():
    return {"status": "ok"}


# ── Admin: authentication ──────────────────────────────────────────────────

@app.post("/api/admin/login", tags=["admin"])
def admin_login(body: AdminLoginIn):
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong password")
    return create_admin_token()


# ── Admin: API key management ──────────────────────────────────────────────

@app.get("/api/admin/keys", tags=["admin"], response_model=List[ApiKeyOut])
def list_keys(
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    records = db.query(ApiKeyORM).order_by(ApiKeyORM.created_at.desc()).all()
    return [ApiKeyOut.from_orm(r) for r in records]


@app.post("/api/admin/keys", tags=["admin"], response_model=ApiKeyOut)
def create_key(
    body: ApiKeyCreate,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    existing = db.query(ApiKeyORM).filter(ApiKeyORM.api_key == body.api_key).first()
    if existing:
        return ApiKeyOut.from_orm(existing)

    try:
        granted = datetime.strptime(body.granted_at, "%Y-%m-%d")
    except ValueError:
        granted = datetime.utcnow()

    record = ApiKeyORM(
        id=secrets.token_urlsafe(8),
        name=body.name,
        auth_id=body.auth_id,
        project_name=body.project_name,
        project_desc=body.project_desc,
        department=body.department,
        models=body.models,
        api_key=body.api_key,
        granted_at=granted,
        revoked=body.revoked,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    log.info("Created API key %s for %s (%s)", record.api_key[:12] + "…", record.name, record.auth_id)
    return ApiKeyOut.from_orm(record)


@app.post("/api/admin/keys/sync", tags=["admin"])
def sync_keys(
    body: BulkSyncIn,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    """Bulk upsert — called by the frontend after admin actions."""
    synced = 0
    for item in body.records:
        existing = db.query(ApiKeyORM).filter(ApiKeyORM.api_key == item.api_key).first()
        if existing:
            existing.revoked = item.revoked
            synced += 1
            continue

        try:
            granted = datetime.strptime(item.granted_at, "%Y-%m-%d")
        except ValueError:
            granted = datetime.utcnow()

        record = ApiKeyORM(
            id=secrets.token_urlsafe(8),
            name=item.name,
            auth_id=item.auth_id,
            project_name=item.project_name,
            project_desc=item.project_desc,
            department=item.department,
            models=item.models,
            api_key=item.api_key,
            granted_at=granted,
            revoked=item.revoked,
        )
        db.add(record)
        synced += 1

    db.commit()
    return {"synced": synced}


@app.post("/api/admin/keys/{key_id}/revoke", tags=["admin"])
def revoke_key(
    key_id: str,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = db.query(ApiKeyORM).get(key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Key not found")
    record.revoked = True
    record.revoked_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@app.delete("/api/admin/keys/{key_id}", tags=["admin"])
def delete_key(
    key_id: str,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = db.query(ApiKeyORM).get(key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Key not found")
    db.delete(record)
    db.commit()
    return {"ok": True}


# ── Admin: model registry sync ─────────────────────────────────────────────

@app.post("/api/admin/models/sync", tags=["admin"])
def sync_models(
    body: dict,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    """Sync model list from frontend admin panel to DB."""
    models: list = body.get("models", [])
    for m in models:
        existing = db.query(ModelRegistryORM).get(m.get("id"))
        if existing:
            existing.status         = m.get("status", existing.status)
            existing.base_url       = m.get("baseUrl", existing.base_url)
            existing.api_key        = m.get("apiKey", existing.api_key)
            existing.model_api_name = m.get("modelApiName", existing.model_api_name)
            existing.import_format  = m.get("importFormat", existing.import_format)
        else:
            record = ModelRegistryORM(
                id=m["id"],
                name=m.get("name", m["id"]),
                provider=m.get("provider", ""),
                short_desc=m.get("shortDescription", ""),
                description=m.get("description", ""),
                context_window=m.get("contextWindow", ""),
                status=m.get("status", "online"),
                category=m.get("category", "chat"),
                speed=m.get("speed", "medium"),
                base_url=m.get("baseUrl"),
                api_key=m.get("apiKey"),
                model_api_name=m.get("modelApiName"),
                import_format=m.get("importFormat", "openai"),
                custom_headers=m.get("customHeaders"),
                extra=m,
            )
            db.add(record)
    db.commit()
    return {"ok": True, "count": len(models)}


@app.get("/api/admin/models", tags=["admin"])
def list_admin_models(
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    records = db.query(ModelRegistryORM).all()
    return [
        {
            "id": r.id, "name": r.name, "provider": r.provider,
            "status": r.status, "category": r.category,
            "baseUrl": r.base_url, "modelApiName": r.model_api_name,
            "importFormat": r.import_format,
        }
        for r in records
    ]


# ── Public: application submission (auto-approve + create API key) ──────────

@app.post("/api/apply", tags=["public"])
def submit_application(body: ApplicationIn, db: Session = Depends(get_db)):
    """
    Submit an API access application.
    Auto-approves immediately and returns a usable API key stored in the DB.
    The admin panel can still view/revoke all keys.
    """
    # Store application record
    record = ApplicationORM(
        name=body.name,
        auth_id=body.authId,
        department=body.department,
        project_name=body.projectName,
        project_desc=body.projectDesc,
        models=body.models,
        reason=body.reason,
        status="approved",
    )
    db.add(record)

    # Auto-generate and persist API key to DB so proxy can validate it
    chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    suffix = "".join(secrets.choice(chars) for _ in range(32))
    raw_key = f"brdc-sk-{suffix}"

    key = ApiKeyORM(
        id=secrets.token_urlsafe(8),
        name=body.name,
        auth_id=body.authId,
        project_name=body.projectName,
        project_desc=body.projectDesc,
        department=body.department,
        models=body.models,
        api_key=raw_key,
        granted_at=datetime.utcnow(),
        revoked=False,
    )
    db.add(key)
    db.commit()
    db.refresh(key)

    log.info("Application auto-approved: %s (%s) → key %s… for %s",
             body.name, body.authId, raw_key[:16], body.models)

    return {
        "id": record.id,
        "status": "approved",
        "apiKey": raw_key,
        "grantedAt": key.granted_at.strftime("%Y-%m-%d"),
        "models": body.models,
    }


@app.get("/api/apply/lookup", tags=["public"])
def lookup_keys(auth_id: str, db: Session = Depends(get_db)):
    """Return all API keys (active + revoked) for a given authId."""
    keys = (
        db.query(ApiKeyORM)
        .filter(ApiKeyORM.auth_id == auth_id)
        .order_by(ApiKeyORM.created_at.desc())
        .all()
    )
    return [ApiKeyOut.from_orm(k) for k in keys]


# ── Public: model list for catalog display ────────────────────────────────

@app.get("/api/public/models", tags=["public"])
def list_public_models(db: Session = Depends(get_db)):
    records = db.query(ModelRegistryORM).all()
    return [
        {
            "id": r.id, "name": r.name, "provider": r.provider,
            "status": r.status, "category": r.category,
            "contextWindow": r.context_window,
            "shortDescription": r.short_desc,
            "description": r.description,
            "speed": r.speed,
            "baseUrl": r.base_url,
            "modelApiName": r.model_api_name,
            "importFormat": r.import_format,
        }
        for r in records
    ]


# ── Admin: model delete ────────────────────────────────────────────────────

@app.delete("/api/admin/models/{model_id}", tags=["admin"])
def delete_model(
    model_id: str,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = db.query(ModelRegistryORM).get(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model not found")
    db.delete(record)
    db.commit()
    return {"ok": True}


# ── Admin: notifications ───────────────────────────────────────────────────

@app.get("/api/admin/notifications", tags=["admin"])
def list_notifications(
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    records = db.query(NotificationORM).order_by(NotificationORM.created_at.desc()).all()
    return [
        {
            "id": r.id, "title": r.title, "description": r.description,
            "type": r.type, "date": r.date, "isNew": r.is_new,
        }
        for r in records
    ]


@app.get("/api/public/notifications", tags=["public"])
def list_public_notifications(db: Session = Depends(get_db)):
    records = db.query(NotificationORM).order_by(NotificationORM.created_at.desc()).all()
    return [
        {
            "id": r.id, "title": r.title, "description": r.description,
            "type": r.type, "date": r.date, "isNew": r.is_new,
        }
        for r in records
    ]


@app.post("/api/admin/notifications", tags=["admin"])
def create_notification(
    body: dict,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = NotificationORM(
        title=body.get("title", ""),
        description=body.get("description", ""),
        type=body.get("type", "info"),
        date=body.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
        is_new=body.get("isNew", True),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "title": record.title, "type": record.type, "date": record.date, "isNew": record.is_new}


@app.put("/api/admin/notifications/{notif_id}", tags=["admin"])
def update_notification(
    notif_id: str,
    body: dict,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = db.query(NotificationORM).get(notif_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if "title" in body:       record.title       = body["title"]
    if "description" in body: record.description = body["description"]
    if "type" in body:        record.type        = body["type"]
    if "date" in body:        record.date        = body["date"]
    if "isNew" in body:       record.is_new      = body["isNew"]
    db.commit()
    return {"ok": True}


@app.delete("/api/admin/notifications/{notif_id}", tags=["admin"])
def delete_notification(
    notif_id: str,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = db.query(NotificationORM).get(notif_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(record)
    db.commit()
    return {"ok": True}


# ── Admin: usage logs ──────────────────────────────────────────────────────

@app.get("/api/admin/usage", tags=["admin"])
def list_usage(
    limit: int = 200,
    offset: int = 0,
    model_id: Optional[str] = None,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    q = db.query(UsageLogORM)
    if model_id:
        q = q.filter(UsageLogORM.model_id == model_id)
    total = q.count()
    records = q.order_by(UsageLogORM.created_at.desc()).offset(offset).limit(limit).all()
    # Build key lookup for names
    key_ids = {r.api_key_id for r in records}
    keys = {k.id: k for k in db.query(ApiKeyORM).filter(ApiKeyORM.id.in_(key_ids)).all()}
    return {
        "total": total,
        "records": [
            {
                "id": r.id,
                "model_id": r.model_id,
                "api_key_id": r.api_key_id,
                "key_name": keys.get(r.api_key_id, ApiKeyORM()).name if r.api_key_id in keys else r.api_key_id,
                "department": keys.get(r.api_key_id, ApiKeyORM()).department if r.api_key_id in keys else "",
                "prompt_tokens": r.prompt_tokens or "0",
                "completion_tokens": r.completion_tokens or "0",
                "total_tokens": r.total_tokens or "0",
                "latency_ms": r.latency_ms or "0",
                "status_code": r.status_code or "200",
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
            }
            for r in records
        ],
    }


# ── Admin: applications ────────────────────────────────────────────────────

@app.get("/api/admin/applications", tags=["admin"])
def list_applications(
    status_filter: Optional[str] = None,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    q = db.query(ApplicationORM)
    if status_filter:
        q = q.filter(ApplicationORM.status == status_filter)
    records = q.order_by(ApplicationORM.created_at.desc()).all()
    return [
        {
            "id": r.id, "name": r.name, "authId": r.auth_id,
            "department": r.department, "projectName": r.project_name,
            "projectDesc": r.project_desc, "models": r.models or [],
            "reason": r.reason, "status": r.status,
            "createdAt": r.created_at.strftime("%Y-%m-%d") if r.created_at else "",
        }
        for r in records
    ]


@app.post("/api/admin/applications/{app_id}/approve", tags=["admin"])
def approve_application(
    app_id: str,
    body: dict,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    """Approve an application: mark as approved and create an API key."""
    record = db.query(ApplicationORM).get(app_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Application not found")
    record.status = "approved"

    raw_key = body.get("apiKey") or f"brdc-{''.join(secrets.token_urlsafe(24).replace('-','').replace('_','')[:32])}"
    key = ApiKeyORM(
        id=secrets.token_urlsafe(8),
        name=record.name,
        auth_id=record.auth_id,
        project_name=record.project_name,
        project_desc=record.project_desc,
        department=record.department,
        models=record.models,
        api_key=raw_key,
        granted_at=datetime.utcnow(),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return ApiKeyOut.from_orm(key)


@app.post("/api/admin/applications/{app_id}/reject", tags=["admin"])
def reject_application(
    app_id: str,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    record = db.query(ApplicationORM).get(app_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Application not found")
    record.status = "rejected"
    db.commit()
    return {"ok": True}


# ── User: register / login ─────────────────────────────────────────────────

@app.post("/api/user/register", tags=["user"])
def user_register(body: dict, db: Session = Depends(get_db)):
    auth_id    = (body.get("authId") or "").strip()
    name       = (body.get("name") or "").strip()
    department = (body.get("department") or "").strip()
    password   = body.get("password") or ""
    if not auth_id or not name or not password:
        raise HTTPException(status_code=400, detail="authId, name, password required")
    existing = db.query(UserORM).filter(UserORM.auth_id == auth_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="该认证号已注册，请直接登录")
    user = UserORM(
        auth_id=auth_id,
        name=name,
        department=department,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log.info("User registered: %s (%s)", name, auth_id)
    return create_user_token(auth_id, name, department)


@app.post("/api/user/login", tags=["user"])
def user_login(body: dict, db: Session = Depends(get_db)):
    auth_id  = (body.get("authId") or "").strip()
    password = body.get("password") or ""
    user = db.query(UserORM).filter(UserORM.auth_id == auth_id).first()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="认证号或密码错误")
    return create_user_token(auth_id, user.name, user.department)


@app.get("/api/user/profile", tags=["user"])
def user_profile(payload: dict = Depends(verify_user_token), db: Session = Depends(get_db)):
    user = db.query(UserORM).filter(UserORM.auth_id == payload["sub"]).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"authId": user.auth_id, "name": user.name, "department": user.department}


# ── User: personal logs ────────────────────────────────────────────────────

@app.get("/api/user/logs", tags=["user"])
def user_logs(
    limit: int = 100,
    offset: int = 0,
    payload: dict = Depends(verify_user_token),
    db: Session = Depends(get_db),
):
    auth_id = payload["sub"]
    # Find all API keys for this user
    key_ids = [k.id for k in db.query(ApiKeyORM).filter(ApiKeyORM.auth_id == auth_id).all()]
    if not key_ids:
        return {"total": 0, "records": []}
    q = db.query(UsageLogORM).filter(UsageLogORM.api_key_id.in_(key_ids))
    total = q.count()
    records = q.order_by(UsageLogORM.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "records": [
            {
                "id": r.id,
                "model_id": r.model_id,
                "prompt_tokens": r.prompt_tokens or "0",
                "completion_tokens": r.completion_tokens or "0",
                "total_tokens": r.total_tokens or "0",
                "latency_ms": r.latency_ms or "0",
                "status_code": r.status_code or "200",
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
            }
            for r in records
        ],
    }


# ── User: personal monthly token stats ────────────────────────────────────

@app.get("/api/user/stats", tags=["user"])
def user_stats(
    year: Optional[int] = None,
    payload: dict = Depends(verify_user_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    auth_id = payload["sub"]
    key_ids = [k.id for k in db.query(ApiKeyORM).filter(ApiKeyORM.auth_id == auth_id).all()]
    if not key_ids:
        return {"monthly": [], "total_tokens": 0, "total_calls": 0}

    year = year or datetime.utcnow().year
    placeholders = ",".join([f"'{k}'" for k in key_ids])
    rows = db.execute(text(f"""
        SELECT strftime('%m', created_at) AS month,
               COUNT(*) AS calls,
               SUM(CAST(COALESCE(total_tokens, '0') AS INTEGER)) AS tokens
        FROM usage_logs
        WHERE api_key_id IN ({placeholders})
          AND strftime('%Y', created_at) = '{year}'
        GROUP BY month
        ORDER BY month
    """)).fetchall()
    monthly = [{"month": int(r[0]), "calls": r[1], "tokens": r[2] or 0} for r in rows]
    total_tokens = sum(r["tokens"] for r in monthly)
    total_calls  = sum(r["calls"] for r in monthly)
    return {"year": year, "monthly": monthly, "total_tokens": total_tokens, "total_calls": total_calls}


# ── Admin: stats endpoints for dashboard ──────────────────────────────────

@app.get("/api/admin/stats/daily", tags=["admin"])
def admin_stats_daily(
    days: int = 30,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    rows = db.execute(text(f"""
        SELECT strftime('%Y-%m-%d', created_at) AS day,
               COUNT(*) AS calls,
               SUM(CAST(COALESCE(total_tokens, '0') AS INTEGER)) AS tokens
        FROM usage_logs
        WHERE created_at >= datetime('now', '-{days} days')
        GROUP BY day
        ORDER BY day
    """)).fetchall()
    return [{"day": r[0], "calls": r[1], "tokens": r[2] or 0} for r in rows]


@app.get("/api/admin/stats/monthly", tags=["admin"])
def admin_stats_monthly(
    year: Optional[int] = None,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    year = year or datetime.utcnow().year
    rows = db.execute(text(f"""
        SELECT strftime('%m', created_at) AS month,
               COUNT(*) AS calls,
               SUM(CAST(COALESCE(total_tokens, '0') AS INTEGER)) AS tokens
        FROM usage_logs
        WHERE strftime('%Y', created_at) = '{year}'
        GROUP BY month
        ORDER BY month
    """)).fetchall()
    return [{"month": int(r[0]), "calls": r[1], "tokens": r[2] or 0} for r in rows]


@app.get("/api/admin/stats/by_model", tags=["admin"])
def admin_stats_by_model(
    days: int = 30,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    rows = db.execute(text(f"""
        SELECT model_id,
               COUNT(*) AS calls,
               SUM(CAST(COALESCE(total_tokens, '0') AS INTEGER)) AS tokens,
               AVG(CAST(COALESCE(latency_ms, '0') AS INTEGER)) AS avg_latency
        FROM usage_logs
        WHERE created_at >= datetime('now', '-{days} days')
        GROUP BY model_id
        ORDER BY calls DESC
        LIMIT 20
    """)).fetchall()
    return [{"model_id": r[0], "calls": r[1], "tokens": r[2] or 0, "avg_latency": round(r[3] or 0)} for r in rows]


@app.get("/api/admin/stats/by_user", tags=["admin"])
def admin_stats_by_user(
    days: int = 30,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    rows = db.execute(text(f"""
        SELECT k.auth_id, k.name, k.department,
               COUNT(l.id) AS calls,
               SUM(CAST(COALESCE(l.total_tokens, '0') AS INTEGER)) AS tokens
        FROM usage_logs l
        JOIN api_keys k ON l.api_key_id = k.id
        WHERE l.created_at >= datetime('now', '-{days} days')
        GROUP BY k.auth_id
        ORDER BY calls DESC
        LIMIT 30
    """)).fetchall()
    return [{"auth_id": r[0], "name": r[1], "department": r[2], "calls": r[3], "tokens": r[4] or 0} for r in rows]


@app.get("/api/admin/stats/overview", tags=["admin"])
def admin_stats_overview(
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    """Summary KPIs: today / this month / this year / all-time."""
    from sqlalchemy import text
    def q(where: str) -> tuple:
        row = db.execute(text(f"""
            SELECT COUNT(*), SUM(CAST(COALESCE(total_tokens,'0') AS INTEGER))
            FROM usage_logs WHERE {where}
        """)).fetchone()
        return int(row[0] or 0), int(row[1] or 0)

    today_calls,   today_tokens   = q("date(created_at) = date('now')")
    month_calls,   month_tokens   = q("strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')")
    year_calls,    year_tokens    = q("strftime('%Y', created_at) = strftime('%Y', 'now')")
    total_calls,   total_tokens   = q("1=1")
    active_keys = db.query(ApiKeyORM).filter(ApiKeyORM.revoked == False).count()  # noqa: E712
    online_models = db.query(ModelRegistryORM).filter(ModelRegistryORM.status == "online").count()
    pending_apps = db.query(ApplicationORM).filter(ApplicationORM.status == "pending").count()
    return {
        "today":  {"calls": today_calls,  "tokens": today_tokens},
        "month":  {"calls": month_calls,  "tokens": month_tokens},
        "year":   {"calls": year_calls,   "tokens": year_tokens},
        "total":  {"calls": total_calls,  "tokens": total_tokens},
        "active_keys": active_keys,
        "online_models": online_models,
        "pending_apps": pending_apps,
    }


@app.get("/api/admin/user-logs", tags=["admin"])
def admin_user_logs(
    auth_id: str,
    limit: int = 200,
    offset: int = 0,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    key_ids = [k.id for k in db.query(ApiKeyORM).filter(ApiKeyORM.auth_id == auth_id).all()]
    if not key_ids:
        return {"total": 0, "records": [], "user": None}
    user = db.query(UserORM).filter(UserORM.auth_id == auth_id).first()
    q = db.query(UsageLogORM).filter(UsageLogORM.api_key_id.in_(key_ids))
    total = q.count()
    records = q.order_by(UsageLogORM.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "user": {"name": user.name, "department": user.department} if user else None,
        "records": [
            {
                "id": r.id, "model_id": r.model_id,
                "prompt_tokens": r.prompt_tokens or "0",
                "completion_tokens": r.completion_tokens or "0",
                "total_tokens": r.total_tokens or "0",
                "latency_ms": r.latency_ms or "0",
                "status_code": r.status_code or "200",
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
            }
            for r in records
        ],
    }


# ── Forum ──────────────────────────────────────────────────────────────────

@app.get("/api/forum/posts", tags=["forum"])
def forum_list_posts(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    total = db.query(ForumPostORM).count()
    posts = (
        db.query(ForumPostORM)
        .order_by(ForumPostORM.is_pinned.desc(), ForumPostORM.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    result = []
    for p in posts:
        reply_count = db.query(ForumReplyORM).filter(ForumReplyORM.post_id == p.id).count()
        result.append({
            "id": p.id, "auth_id": p.auth_id, "author_name": p.author_name,
            "department": p.department, "title": p.title,
            "content": p.content[:200],  # preview
            "is_pinned": p.is_pinned, "reply_count": reply_count,
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M") if p.created_at else "",
        })
    return {"total": total, "posts": result}


@app.post("/api/forum/posts", tags=["forum"])
def forum_create_post(
    body: dict,
    payload: dict = Depends(verify_user_token),
    db: Session = Depends(get_db),
):
    title   = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="title and content required")
    post = ForumPostORM(
        auth_id=payload["sub"],
        author_name=payload.get("name", payload["sub"]),
        department=payload.get("department", ""),
        title=title,
        content=content,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {"id": post.id, "title": post.title, "created_at": post.created_at.strftime("%Y-%m-%d %H:%M")}


@app.get("/api/forum/posts/{post_id}", tags=["forum"])
def forum_get_post(post_id: str, db: Session = Depends(get_db)):
    post = db.query(ForumPostORM).get(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    replies = db.query(ForumReplyORM).filter(ForumReplyORM.post_id == post_id).order_by(ForumReplyORM.created_at).all()
    return {
        "id": post.id, "auth_id": post.auth_id, "author_name": post.author_name,
        "department": post.department, "title": post.title, "content": post.content,
        "is_pinned": post.is_pinned,
        "created_at": post.created_at.strftime("%Y-%m-%d %H:%M") if post.created_at else "",
        "replies": [
            {
                "id": r.id, "auth_id": r.auth_id, "author_name": r.author_name,
                "department": r.department, "content": r.content,
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
            }
            for r in replies
        ],
    }


@app.post("/api/forum/posts/{post_id}/replies", tags=["forum"])
def forum_create_reply(
    post_id: str,
    body: dict,
    payload: dict = Depends(verify_user_token),
    db: Session = Depends(get_db),
):
    post = db.query(ForumPostORM).get(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    reply = ForumReplyORM(
        post_id=post_id,
        auth_id=payload["sub"],
        author_name=payload.get("name", payload["sub"]),
        department=payload.get("department", ""),
        content=content,
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return {"id": reply.id, "created_at": reply.created_at.strftime("%Y-%m-%d %H:%M")}


@app.delete("/api/forum/posts/{post_id}", tags=["forum"])
def forum_delete_post(
    post_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Delete a forum post. Author can delete their own post; admin can delete any."""
    from fastapi.security import HTTPBearer as _Bearer
    auth_header = request.headers.get("authorization", "")
    token_str = auth_header.split(" ")[-1] if auth_header.startswith("Bearer ") else ""
    post = db.query(ForumPostORM).get(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    # Try admin token first
    try:
        import jwt as _jwt
        payload = _jwt.decode(token_str, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("sub") == "admin":
            db.query(ForumReplyORM).filter(ForumReplyORM.post_id == post_id).delete()
            db.delete(post)
            db.commit()
            return {"ok": True}
        # User token — only author may delete
        if payload.get("role") == "user" and payload.get("sub") == post.auth_id:
            db.query(ForumReplyORM).filter(ForumReplyORM.post_id == post_id).delete()
            db.delete(post)
            db.commit()
            return {"ok": True}
        raise HTTPException(status_code=403, detail="Not allowed to delete this post")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@app.delete("/api/forum/replies/{reply_id}", tags=["forum"])
def forum_delete_reply(
    reply_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Delete a reply. Author can delete their own reply; admin can delete any."""
    auth_header = request.headers.get("authorization", "")
    token_str = auth_header.split(" ")[-1] if auth_header.startswith("Bearer ") else ""
    reply = db.query(ForumReplyORM).get(reply_id)
    if reply is None:
        raise HTTPException(status_code=404, detail="Reply not found")
    try:
        import jwt as _jwt
        payload = _jwt.decode(token_str, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("sub") == "admin":
            db.delete(reply)
            db.commit()
            return {"ok": True}
        if payload.get("role") == "user" and payload.get("sub") == reply.auth_id:
            db.delete(reply)
            db.commit()
            return {"ok": True}
        raise HTTPException(status_code=403, detail="Not allowed to delete this reply")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@app.patch("/api/forum/posts/{post_id}/pin", tags=["forum"])
def forum_pin_post(
    post_id: str,
    body: dict,
    _: str = Depends(verify_admin_token),
    db: Session = Depends(get_db),
):
    post = db.query(ForumPostORM).get(post_id)
    if post is None:
        raise HTTPException(status_code=404)
    post.is_pinned = bool(body.get("pinned", True))
    db.commit()
    return {"ok": True}


# ── Startup migration: remove stale model IDs removed from the catalog ────

_STALE_MODEL_IDS = {
    "qwen3.5-9b", "gemma3-27b", "qwen3.5-27b", "gemma4-31b",
}

def _migrate_remove_stale_models():
    """
    Remove model registry entries that no longer exist in the frontend catalog.
    Safe to run on every boot — idempotent.
    """
    db = next(get_db())
    try:
        removed = 0
        for model_id in _STALE_MODEL_IDS:
            record = db.query(ModelRegistryORM).get(model_id)
            if record is not None:
                db.delete(record)
                removed += 1
        if removed:
            db.commit()
            log.info("Migration: removed %d stale model(s) from registry: %s",
                     removed, ", ".join(_STALE_MODEL_IDS))
    finally:
        db.close()


# ── Seed default model registry on first boot ──────────────────────────────

def _seed_models_if_empty():
    """
    Pre-populate the model registry with the models from the frontend model-data.ts.
    Admin can later update base_url / api_key per model via the admin panel or API.
    """
    db = next(get_db())
    try:
        if db.query(ModelRegistryORM).count() > 0:
            return

        defaults = [
            # Flagship models
            ("qwen3.5-35b",            "通义千问", "flagship", "online"),
            ("qwen3.5-122b",           "通义千问", "flagship", "online"),
            ("gemma4-26b",             "Google",   "flagship", "online"),
            ("glm4.7-flash-30b",       "智谱AI",   "flagship", "online"),
            # Chat/text models — non-stable (may change with model testing)
            ("qwen2-72b",              "通义千问", "chat",     "unstable"),
            ("deepseek-v3",            "DeepSeek", "chat",     "unstable"),
            ("deepseek-r1-distill-32b","DeepSeek", "chat",     "maintenance"),
            # Vision
            ("qwen2.5-vl-7b",          "通义千问", "vision",   "unstable"),
            # Embedding models
            ("bge-m3",                 "BAAI",     "embedding","online"),
            ("qwen3-embedding-8b",     "通义千问", "embedding","online"),
            ("qwen3-vl-embedding-2b",  "通义千问", "embedding","online"),
            # Reranker models
            ("bge-reranker",           "BAAI",     "reranker", "online"),
            ("qwen3-reranker-8b",      "通义千问", "reranker", "online"),
            ("qwen3-vl-reranker-2b",   "通义千问", "reranker", "online"),
        ]
        for model_id, provider, category, model_status in defaults:
            db.add(ModelRegistryORM(
                id=model_id,
                name=model_id,
                provider=provider,
                category=category,
                status=model_status,
                import_format="openai",
                # base_url and api_key left null — admin sets these per deployment
            ))
        db.commit()
        log.info("Seeded %d default models into registry", len(defaults))
    finally:
        db.close()
