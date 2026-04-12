"""
SQLAlchemy ORM models + Pydantic schemas.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field
from sqlalchemy import (
    Boolean, Column, DateTime, JSON, String, Text, func,
)

from app.database import Base


# ── ORM ────────────────────────────────────────────────────────────────────

class ApiKeyORM(Base):
    __tablename__ = "api_keys"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False)
    auth_id     = Column(String, nullable=False, index=True)
    project_name = Column(String, nullable=False)
    project_desc = Column(Text, nullable=True)
    department  = Column(String, nullable=False)
    models      = Column(JSON, nullable=False, default=list)
    api_key     = Column(String, nullable=False, unique=True, index=True)
    granted_at  = Column(DateTime, nullable=False, default=datetime.utcnow)
    revoked     = Column(Boolean, nullable=False, default=False)
    revoked_at  = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())


class ApplicationORM(Base):
    __tablename__ = "applications"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name         = Column(String, nullable=False)
    auth_id      = Column(String, nullable=False)
    department   = Column(String, nullable=False)
    project_name = Column(String, nullable=False)
    project_desc = Column(Text, nullable=True)
    models       = Column(JSON, nullable=False, default=list)
    reason       = Column(Text, nullable=True)
    status       = Column(String, nullable=False, default="pending")  # pending|approved|rejected
    created_at   = Column(DateTime, server_default=func.now())


class ModelRegistryORM(Base):
    __tablename__ = "model_registry"

    id              = Column(String, primary_key=True)
    name            = Column(String, nullable=False)
    provider        = Column(String, nullable=False)
    short_desc      = Column(Text, nullable=True)
    description     = Column(Text, nullable=True)
    context_window  = Column(String, nullable=True)
    status          = Column(String, nullable=False, default="online")
    category        = Column(String, nullable=False, default="chat")
    speed           = Column(String, nullable=True)
    base_url        = Column(String, nullable=True)
    api_key         = Column(String, nullable=True)
    model_api_name  = Column(String, nullable=True)
    import_format   = Column(String, nullable=True, default="openai")
    custom_headers  = Column(JSON, nullable=True)
    extra           = Column(JSON, nullable=True)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())


class UsageLogORM(Base):
    __tablename__ = "usage_logs"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    api_key_id      = Column(String, nullable=False, index=True)
    model_id        = Column(String, nullable=False, index=True)
    prompt_tokens   = Column(String, nullable=True)
    completion_tokens = Column(String, nullable=True)
    total_tokens    = Column(String, nullable=True)
    latency_ms      = Column(String, nullable=True)
    status_code     = Column(String, nullable=True)
    created_at      = Column(DateTime, server_default=func.now())


class NotificationORM(Base):
    __tablename__ = "notifications"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title       = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    type        = Column(String, nullable=False, default="info")  # online|offline|maintenance|info
    date        = Column(String, nullable=False)
    is_new      = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime, server_default=func.now())


class UserORM(Base):
    """Registered users for forum and personal statistics."""
    __tablename__ = "users"

    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    auth_id       = Column(String, nullable=False, unique=True, index=True)
    name          = Column(String, nullable=False)
    department    = Column(String, nullable=False, default="")
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime, server_default=func.now())


class ForumPostORM(Base):
    __tablename__ = "forum_posts"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    auth_id     = Column(String, nullable=False, index=True)
    author_name = Column(String, nullable=False)
    department  = Column(String, nullable=True)
    title       = Column(String, nullable=False)
    content     = Column(Text, nullable=False)
    is_pinned   = Column(Boolean, nullable=False, default=False)
    created_at  = Column(DateTime, server_default=func.now())


class ForumReplyORM(Base):
    __tablename__ = "forum_replies"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    post_id     = Column(String, nullable=False, index=True)
    auth_id     = Column(String, nullable=False, index=True)
    author_name = Column(String, nullable=False)
    department  = Column(String, nullable=True)
    content     = Column(Text, nullable=False)
    created_at  = Column(DateTime, server_default=func.now())


# ── Pydantic schemas ────────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str
    auth_id: str = Field(alias="authId")
    project_name: str = Field(alias="projectName")
    project_desc: Optional[str] = Field(None, alias="projectDesc")
    department: str
    models: List[str]
    api_key: str = Field(alias="apiKey")
    granted_at: str = Field(alias="grantedAt")
    revoked: bool = False

    model_config = {"populate_by_name": True}


class ApiKeyOut(BaseModel):
    id: str
    name: str
    authId: str
    projectName: str
    projectDesc: Optional[str]
    department: str
    models: List[str]
    apiKey: str
    grantedAt: str
    revoked: bool

    @classmethod
    def from_orm(cls, obj: ApiKeyORM) -> "ApiKeyOut":
        return cls(
            id=obj.id,
            name=obj.name,
            authId=obj.auth_id,
            projectName=obj.project_name,
            projectDesc=obj.project_desc,
            department=obj.department,
            models=obj.models or [],
            apiKey=obj.api_key,
            grantedAt=obj.granted_at.strftime("%Y-%m-%d") if obj.granted_at else "",
            revoked=obj.revoked,
        )


class ApplicationIn(BaseModel):
    name: str
    authId: str
    department: str
    projectName: str
    projectDesc: Optional[str] = None
    models: List[str]
    reason: Optional[str] = None


class BulkSyncIn(BaseModel):
    records: List[ApiKeyCreate]


class AdminLoginIn(BaseModel):
    password: str
