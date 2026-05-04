import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.api_spaces import Api_spaces

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Api_spacesService:
    """Service layer for Api_spaces operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any]) -> Optional[Api_spaces]:
        """Create a new api_spaces"""
        try:
            obj = Api_spaces(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created api_spaces with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating api_spaces: {str(e)}")
            raise

    async def get_by_id(self, obj_id: int) -> Optional[Api_spaces]:
        """Get api_spaces by ID"""
        try:
            query = select(Api_spaces).where(Api_spaces.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching api_spaces {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of api_spacess"""
        try:
            query = select(Api_spaces)
            count_query = select(func.count(Api_spaces.id))
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Api_spaces, field):
                        query = query.where(getattr(Api_spaces, field) == value)
                        count_query = count_query.where(getattr(Api_spaces, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Api_spaces, field_name):
                        query = query.order_by(getattr(Api_spaces, field_name).desc())
                else:
                    if hasattr(Api_spaces, sort):
                        query = query.order_by(getattr(Api_spaces, sort))
            else:
                query = query.order_by(Api_spaces.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching api_spaces list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any]) -> Optional[Api_spaces]:
        """Update api_spaces"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Api_spaces {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key):
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated api_spaces {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating api_spaces {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int) -> bool:
        """Delete api_spaces"""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Api_spaces {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted api_spaces {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting api_spaces {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Api_spaces]:
        """Get api_spaces by any field"""
        try:
            if not hasattr(Api_spaces, field_name):
                raise ValueError(f"Field {field_name} does not exist on Api_spaces")
            result = await self.db.execute(
                select(Api_spaces).where(getattr(Api_spaces, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching api_spaces by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Api_spaces]:
        """Get list of api_spacess filtered by field"""
        try:
            if not hasattr(Api_spaces, field_name):
                raise ValueError(f"Field {field_name} does not exist on Api_spaces")
            result = await self.db.execute(
                select(Api_spaces)
                .where(getattr(Api_spaces, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Api_spaces.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching api_spacess by {field_name}: {str(e)}")
            raise