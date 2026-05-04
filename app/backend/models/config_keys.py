from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Config_keys(Base):
    __tablename__ = "config_keys"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    key_name = Column(String, nullable=False)
    encrypted_value = Column(String, nullable=True)
    last_tested_at = Column(String, nullable=True)
    is_valid = Column(Boolean, nullable=True)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)