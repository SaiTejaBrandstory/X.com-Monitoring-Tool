from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text


class Personas(Base):
    __tablename__ = "personas"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    tone_description = Column(String, nullable=True)
    style_rules = Column(String, nullable=True)
    few_shot_examples = Column(String, nullable=True)
    default_platform = Column(String, nullable=True)
    default_max_words = Column(Integer, nullable=True)
    # JSON string mapping funnel stage -> content guidance
    # e.g. {"TOFU": "Educational, broad hooks, awareness...", "MOFU": "...", "BOFU": "..."}
    funnel_stages = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)