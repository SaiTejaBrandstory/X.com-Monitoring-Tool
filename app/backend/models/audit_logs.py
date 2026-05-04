from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Audit_logs(Base):
    __tablename__ = "audit_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target = Column(String, nullable=True)
    details = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)