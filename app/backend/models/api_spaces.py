from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Api_spaces(Base):
    __tablename__ = "api_spaces"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    label = Column(String, nullable=False)
    provider = Column(String, nullable=True)
    api_token_encrypted = Column(String, nullable=True)
    actor_type = Column(String, nullable=False)
    platform = Column(String, nullable=False)
    proxy_group = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True)
    last_tested_at = Column(String, nullable=True)
    test_status = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)