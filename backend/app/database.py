"""
SQLite database setup via SQLAlchemy (sync, file-based).
DB file is stored at /data/bxdc.db inside the container (Docker volume).
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_PATH = os.getenv("DB_PATH", "/data/bxdc.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called once at startup."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    from app import models as _  # noqa: F401 — import to register ORM models
    Base.metadata.create_all(bind=engine)
