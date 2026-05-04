import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.monitored_profiles import Monitored_profilesService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/monitored_profiles", tags=["monitored_profiles"])


# ---------- Pydantic Schemas ----------
class Monitored_profilesData(BaseModel):
    """Entity data schema (for create/update)"""
    category_id: Optional[int] = None
    platform: str
    handle: str
    display_name: str = None
    avatar_url: str = None
    profile_url: str = None
    is_active: bool = None


class Monitored_profilesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    category_id: Optional[int] = None
    platform: Optional[str] = None
    handle: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    profile_url: Optional[str] = None
    is_active: Optional[bool] = None


class Monitored_profilesResponse(BaseModel):
    """Entity response schema"""
    id: int
    category_id: Optional[int] = None
    platform: str
    handle: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    profile_url: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Monitored_profilesListResponse(BaseModel):
    """List response schema"""
    items: List[Monitored_profilesResponse]
    total: int
    skip: int
    limit: int


class Monitored_profilesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Monitored_profilesData]


class Monitored_profilesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Monitored_profilesUpdateData


class Monitored_profilesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Monitored_profilesBatchUpdateItem]


class Monitored_profilesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Monitored_profilesListResponse)
async def query_monitored_profiless(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query monitored_profiless with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying monitored_profiless: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Monitored_profilesService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} monitored_profiless")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying monitored_profiless: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Monitored_profilesListResponse)
async def query_monitored_profiless_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query monitored_profiless with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying monitored_profiless: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Monitored_profilesService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} monitored_profiless")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying monitored_profiless: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Monitored_profilesResponse)
async def get_monitored_profiles(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single monitored_profiles by ID (user can only see their own records)"""
    logger.debug(f"Fetching monitored_profiles with id: {id}, fields={fields}")
    
    service = Monitored_profilesService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Monitored_profiles with id {id} not found")
            raise HTTPException(status_code=404, detail="Monitored_profiles not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching monitored_profiles {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Monitored_profilesResponse, status_code=201)
async def create_monitored_profiles(
    data: Monitored_profilesData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new monitored_profiles"""
    logger.debug(f"Creating new monitored_profiles with data: {data}")
    
    service = Monitored_profilesService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create monitored_profiles")
        
        logger.info(f"Monitored_profiles created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating monitored_profiles: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating monitored_profiles: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Monitored_profilesResponse], status_code=201)
async def create_monitored_profiless_batch(
    request: Monitored_profilesBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple monitored_profiless in a single request"""
    logger.debug(f"Batch creating {len(request.items)} monitored_profiless")
    
    service = Monitored_profilesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} monitored_profiless successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Monitored_profilesResponse])
async def update_monitored_profiless_batch(
    request: Monitored_profilesBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple monitored_profiless in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} monitored_profiless")
    
    service = Monitored_profilesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} monitored_profiless successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Monitored_profilesResponse)
async def update_monitored_profiles(
    id: int,
    data: Monitored_profilesUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing monitored_profiles (requires ownership)"""
    logger.debug(f"Updating monitored_profiles {id} with data: {data}")

    service = Monitored_profilesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Monitored_profiles with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Monitored_profiles not found")
        
        logger.info(f"Monitored_profiles {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating monitored_profiles {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating monitored_profiles {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_monitored_profiless_batch(
    request: Monitored_profilesBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple monitored_profiless by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} monitored_profiless")
    
    service = Monitored_profilesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} monitored_profiless successfully")
        return {"message": f"Successfully deleted {deleted_count} monitored_profiless", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_monitored_profiles(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single monitored_profiles by ID (requires ownership)"""
    logger.debug(f"Deleting monitored_profiles with id: {id}")
    
    service = Monitored_profilesService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Monitored_profiles with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Monitored_profiles not found")
        
        logger.info(f"Monitored_profiles {id} deleted successfully")
        return {"message": "Monitored_profiles deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting monitored_profiles {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")