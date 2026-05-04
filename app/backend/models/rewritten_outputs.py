from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Rewritten_outputs(Base):
    __tablename__ = "rewritten_outputs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    saved_post_id = Column(Integer, nullable=True)
    persona_id = Column(Integer, nullable=True)
    original_content = Column(String, nullable=True)
    original_hook = Column(String, nullable=True)
    rewritten_content = Column(String, nullable=False)
    word_count = Column(Integer, nullable=True)
    char_count = Column(Integer, nullable=True)
    platform_target = Column(String, nullable=True)
    version = Column(Integer, nullable=True)
    lock_hook = Column(Boolean, nullable=True)
    max_words = Column(Integer, nullable=True)
    max_chars = Column(Integer, nullable=True)
    model_used = Column(String, nullable=True)
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)