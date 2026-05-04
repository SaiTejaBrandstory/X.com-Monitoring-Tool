from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text


class Ingested_posts(Base):
    __tablename__ = "ingested_posts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    profile_id = Column(Integer, nullable=True)
    platform = Column(String, nullable=False)
    author_handle = Column(String, nullable=True)
    author_name = Column(String, nullable=True)
    author_avatar = Column(String, nullable=True)
    content = Column(String, nullable=False)
    likes = Column(Integer, nullable=True)
    retweets = Column(Integer, nullable=True)
    replies = Column(Integer, nullable=True)
    engagement_score = Column(Float, nullable=True)
    virality_trend = Column(String, nullable=True)
    posted_at = Column(String, nullable=True)
    raw_url = Column(String, nullable=True)
    # JSON: media (photos, gif/video previews), link entities, etc. from X API v2
    post_extras = Column(Text, nullable=True)
    category_id = Column(Integer, nullable=True)
    is_new = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)