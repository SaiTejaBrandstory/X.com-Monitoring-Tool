import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.categories import Categories

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class CategoriesService:
    """Service layer for Categories operations.

    Categories are shared data across all users (no user_id column),
    so ownership filters are intentionally ignored.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Categories]:
        """Create a new categories row. `user_id` is accepted for API compatibility but not stored."""
        try:
            # Strip any user_id passed in; Categories is a shared table.
            data = {k: v for k, v in data.items() if k != "user_id"}
            obj = Categories(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created categories with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating categories: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Categories are shared data; any authenticated user may operate on them."""
        obj = await self.get_by_id(obj_id)
        return obj is not None

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Categories]:
        """Get categories by ID. `user_id` is ignored because categories are shared."""
        try:
            query = select(Categories).where(Categories.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching categories {obj_id}: {str(e)}")
            raise

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of categories. `user_id` is ignored (shared table)."""
        try:
            query = select(Categories)
            count_query = select(func.count(Categories.id))

            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Categories, field):
                        query = query.where(getattr(Categories, field) == value)
                        count_query = count_query.where(getattr(Categories, field) == value)

            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Categories, field_name):
                        query = query.order_by(getattr(Categories, field_name).desc())
                else:
                    if hasattr(Categories, sort):
                        query = query.order_by(getattr(Categories, sort))
            else:
                query = query.order_by(Categories.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching categories list: {str(e)}")
            raise

    async def update(
        self,
        obj_id: int,
        update_data: Dict[str, Any],
        user_id: Optional[str] = None,
    ) -> Optional[Categories]:
        """Update categories. `user_id` is ignored (shared table)."""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Categories {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated categories {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating categories {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete categories. `user_id` is ignored (shared table)."""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Categories {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted categories {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting categories {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Categories]:
        """Get categories by any field"""
        try:
            if not hasattr(Categories, field_name):
                raise ValueError(f"Field {field_name} does not exist on Categories")
            result = await self.db.execute(
                select(Categories).where(getattr(Categories, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching categories by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Categories]:
        """Get list of categories filtered by field"""
        try:
            if not hasattr(Categories, field_name):
                raise ValueError(f"Field {field_name} does not exist on Categories")
            result = await self.db.execute(
                select(Categories)
                .where(getattr(Categories, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Categories.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching categoriess by {field_name}: {str(e)}")
            raise