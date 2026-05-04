import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.monitored_profiles import Monitored_profiles
from services.xcom_user_lookup import merge_twitter_row

logger = logging.getLogger(__name__)

_ID_KEYS = frozenset(
    {"handle", "platform", "display_name", "avatar_url", "profile_url"}
)


# ------------------ Service Layer ------------------
class Monitored_profilesService:
    """Service layer for Monitored_profiles operations.

    Monitored_profiles is a shared table (no user_id column). Any authenticated
    user may read/write these rows, so ownership filters are intentionally ignored.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Monitored_profiles]:
        """Create a new monitored_profiles row. `user_id` is accepted but not stored."""
        try:
            data = {k: v for k, v in data.items() if k != "user_id"}
            data = await merge_twitter_row(data)
            obj = Monitored_profiles(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created monitored_profiles with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating monitored_profiles: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Shared table: any authenticated user is considered an owner if the row exists."""
        obj = await self.get_by_id(obj_id)
        return obj is not None

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Monitored_profiles]:
        """Get monitored_profiles by ID. `user_id` is ignored (shared table)."""
        try:
            query = select(Monitored_profiles).where(Monitored_profiles.id == obj_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching monitored_profiles {obj_id}: {str(e)}")
            raise

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of monitored_profiles. `user_id` is ignored (shared)."""
        try:
            query = select(Monitored_profiles)
            count_query = select(func.count(Monitored_profiles.id))

            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Monitored_profiles, field):
                        query = query.where(getattr(Monitored_profiles, field) == value)
                        count_query = count_query.where(getattr(Monitored_profiles, field) == value)

            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Monitored_profiles, field_name):
                        query = query.order_by(getattr(Monitored_profiles, field_name).desc())
                else:
                    if hasattr(Monitored_profiles, sort):
                        query = query.order_by(getattr(Monitored_profiles, sort))
            else:
                query = query.order_by(Monitored_profiles.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching monitored_profiles list: {str(e)}")
            raise

    async def update(
        self,
        obj_id: int,
        update_data: Dict[str, Any],
        user_id: Optional[str] = None,
    ) -> Optional[Monitored_profiles]:
        """Update monitored_profiles. `user_id` is ignored (shared table)."""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Monitored_profiles {obj_id} not found for update")
                return None

            plat = (
                update_data.get("platform")
                if "platform" in update_data
                else obj.platform
            )
            if (
                str(plat or "").lower() == "twitter"
                and _ID_KEYS.intersection(update_data.keys())
            ):
                row = {
                    "platform": plat,
                    "handle": (
                        update_data["handle"]
                        if "handle" in update_data
                        else obj.handle
                    ),
                    "display_name": (
                        update_data["display_name"]
                        if "display_name" in update_data
                        else obj.display_name
                    ),
                    "avatar_url": (
                        update_data["avatar_url"]
                        if "avatar_url" in update_data
                        else obj.avatar_url
                    ),
                    "profile_url": (
                        update_data["profile_url"]
                        if "profile_url" in update_data
                        else obj.profile_url
                    ),
                }
                enriched = await merge_twitter_row(row)
                update_data["handle"] = enriched["handle"]
                update_data["display_name"] = enriched["display_name"]
                if enriched.get("avatar_url") is not None:
                    update_data["avatar_url"] = enriched["avatar_url"]
                if enriched.get("profile_url"):
                    update_data["profile_url"] = enriched["profile_url"]

            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated monitored_profiles {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating monitored_profiles {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete monitored_profiles. `user_id` is ignored (shared table)."""
        try:
            obj = await self.get_by_id(obj_id)
            if not obj:
                logger.warning(f"Monitored_profiles {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted monitored_profiles {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting monitored_profiles {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Monitored_profiles]:
        """Get monitored_profiles by any field"""
        try:
            if not hasattr(Monitored_profiles, field_name):
                raise ValueError(f"Field {field_name} does not exist on Monitored_profiles")
            result = await self.db.execute(
                select(Monitored_profiles).where(getattr(Monitored_profiles, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching monitored_profiles by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Monitored_profiles]:
        """Get list of monitored_profiles filtered by field"""
        try:
            if not hasattr(Monitored_profiles, field_name):
                raise ValueError(f"Field {field_name} does not exist on Monitored_profiles")
            result = await self.db.execute(
                select(Monitored_profiles)
                .where(getattr(Monitored_profiles, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Monitored_profiles.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching monitored_profiles by {field_name}: {str(e)}")
            raise