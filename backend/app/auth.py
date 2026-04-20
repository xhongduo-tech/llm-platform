"""
Authentication helpers:
  - Admin password check + JWT issuance
  - User registration / login JWT
  - API-key validation for proxy calls
  - Password hashing via stdlib hashlib (no extra deps)
"""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiKeyORM

# ── Config ─────────────────────────────────────────────────────────────────

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "990115")
JWT_SECRET     = os.getenv("JWT_SECRET", secrets.token_urlsafe(32))
JWT_ALGORITHM  = "HS256"
JWT_TTL_HOURS  = int(os.getenv("JWT_TTL_HOURS", "12"))

bearer_scheme = HTTPBearer(auto_error=False)

# ── Admin JWT ──────────────────────────────────────────────────────────────

def create_admin_token() -> dict:
    expires = datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS)
    payload = {"sub": "admin", "exp": expires, "iat": datetime.now(timezone.utc)}
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"token": token, "expiresIn": JWT_TTL_HOURS * 3600}


def verify_admin_token(
    creds: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> str:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("sub") != "admin":
            raise ValueError
        return "admin"
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


# ── API key validation ─────────────────────────────────────────────────────

def validate_api_key(
    raw_key: str,
    model_id: str,
    db: Session,
) -> ApiKeyORM:
    """
    Validate an API key from a proxy request.
    Returns the ApiKeyORM record on success, raises HTTPException on failure.
    """
    record: Optional[ApiKeyORM] = (
        db.query(ApiKeyORM)
        .filter(ApiKeyORM.api_key == raw_key, ApiKeyORM.revoked == False)  # noqa: E712
        .first()
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
        )
    # Check model access
    allowed: list = record.models or []
    if allowed and model_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Key does not have access to model '{model_id}'",
        )
    return record


# ── Password hashing (stdlib PBKDF2, no extra deps) ────────────────────────

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return base64.b64encode(salt + dk).decode("ascii")


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        raw = base64.b64decode(stored_hash.encode("ascii"))
        salt, stored_dk = raw[:16], raw[16:]
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
        return secrets.compare_digest(dk, stored_dk)
    except Exception:
        return False


# ── User JWT (7-day TTL) ────────────────────────────────────────────────────

USER_JWT_TTL_HOURS = 24 * 7  # 7 days


def create_user_token(auth_id: str, name: str, department: str) -> dict:
    expires = datetime.now(timezone.utc) + timedelta(hours=USER_JWT_TTL_HOURS)
    payload = {
        "sub": auth_id,
        "name": name,
        "department": department,
        "role": "user",
        "exp": expires,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "token": token,
        "expiresIn": USER_JWT_TTL_HOURS * 3600,
        "authId": auth_id,
        "name": name,
        "department": department,
    }


def verify_user_token(
    creds: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> dict:
    """Returns decoded payload {sub, name, department, role}. Raises 401 on failure."""
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("role") != "user":
            raise ValueError("not a user token")
        return payload
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def verify_user_token_optional(
    creds: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> Optional[dict]:
    """Like verify_user_token but returns None instead of raising (for optional-auth routes)."""
    if creds is None:
        return None
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("role") != "user":
            return None
        return payload
    except Exception:
        return None


# ── extract_bearer (proxy auth) ─────────────────────────────────────────────

def extract_bearer(authorization: Optional[str]) -> str:
    """Extract token from 'Bearer <token>' header value."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return parts[1]
