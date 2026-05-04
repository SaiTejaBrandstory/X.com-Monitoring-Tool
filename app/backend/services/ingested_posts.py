import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.ingested_posts import Ingested_posts

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Ingested_postsService:
    """Service layer for Ingested_posts operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Ingested_posts]:
        """Create a new ingested_posts"""
        try:
            obj = Ingested_posts(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created ingested_posts with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating ingested_posts: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Ingested_posts]:
        """Get ingested_posts by ID"""
        try:
            query = select(Ingested_posts).where(Ingested_posts.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching ingested_posts {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of ingested_postss"""
        try:
            query = select(Ingested_posts)
            count_query = select(func.count(Ingested_posts.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Ingested_posts, field):
                        query = query.where(getattr(Ingested_posts, field) == value)
                        count_query = count_query.where(getattr(Ingested_posts, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Ingested_posts, field_name):
                        query = query.order_by(getattr(Ingested_posts, field_name).desc())
                else:
                    if hasattr(Ingested_posts, sort):
                        query = query.order_by(getattr(Ingested_posts, sort))
            else:
                query = query.order_by(Ingested_posts.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching ingested_posts list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Ingested_posts]:
        """Update ingested_posts"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Ingested_posts {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated ingested_posts {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating ingested_posts {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete ingested_posts"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Ingested_posts {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted ingested_posts {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting ingested_posts {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Ingested_posts]:
        """Get ingested_posts by any field"""
        try:
            if not hasattr(Ingested_posts, field_name):
                raise ValueError(f"Field {field_name} does not exist on Ingested_posts")
            result = await self.db.execute(
                select(Ingested_posts).where(getattr(Ingested_posts, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching ingested_posts by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Ingested_posts]:
        """Get list of ingested_postss filtered by field"""
        try:
            if not hasattr(Ingested_posts, field_name):
                raise ValueError(f"Field {field_name} does not exist on Ingested_posts")
            result = await self.db.execute(
                select(Ingested_posts)
                .where(getattr(Ingested_posts, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Ingested_posts.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching ingested_postss by {field_name}: {str(e)}")
            raise