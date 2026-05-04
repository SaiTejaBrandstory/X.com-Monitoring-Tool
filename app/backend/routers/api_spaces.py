import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.api_spaces import Api_spacesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/api_spaces", tags=["api_spaces"])


# ---------- Pydantic Schemas ----------
class Api_spacesData(BaseModel):
    """Entity data schema (for create/update)"""
    label: str
    provider: str = None
    api_token_encrypted: str = None
    actor_type: str
    platform: str
    proxy_group: str = None
    is_active: bool = None
    last_tested_at: str = None
    test_status: str = None
    notes: str = None


class Api_spacesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    label: Optional[str] = None
    provider: Optional[str] = None
    api_token_encrypted: Optional[str] = None
    actor_type: Optional[str] = None
    platform: Optional[str] = None
    proxy_group: Optional[str] = None
    is_active: Optional[bool] = None
    last_tested_at: Optional[str] = None
    test_status: Optional[str] = None
    notes: Optional[str] = None


class Api_spacesResponse(BaseModel):
    """Entity response schema"""
    id: int
    label: str
    provider: Optional[str] = None
    api_token_encrypted: Optional[str] = None
    actor_type: str
    platform: str
    proxy_group: Optional[str] = None
    is_active: Optional[bool] = None
    last_tested_at: Optional[str] = None
    test_status: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Api_spacesListResponse(BaseModel):
    """List response schema"""
    items: List[Api_spacesResponse]
    total: int
    skip: int
    limit: int


class Api_spacesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Api_spacesData]


class Api_spacesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Api_spacesUpdateData


class Api_spacesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Api_spacesBatchUpdateItem]


class Api_spacesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Api_spacesListResponse)
async def query_api_spacess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query api_spacess with filtering, sorting, and pagination"""
    logger.debug(f"Querying api_spacess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Api_spacesService(db)
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
        )
        logger.debug(f"Found {result['total']} api_spacess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying api_spacess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Api_spacesListResponse)
async def query_api_spacess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query api_spacess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying api_spacess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Api_spacesService(db)
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
        logger.debug(f"Found {result['total']} api_spacess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying api_spacess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Api_spacesResponse)
async def get_api_spaces(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single api_spaces by ID"""
    logger.debug(f"Fetching api_spaces with id: {id}, fields={fields}")
    
    service = Api_spacesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Api_spaces with id {id} not found")
            raise HTTPException(status_code=404, detail="Api_spaces not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching api_spaces {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Api_spacesResponse, status_code=201)
async def create_api_spaces(
    data: Api_spacesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new api_spaces"""
    logger.debug(f"Creating new api_spaces with data: {data}")
    
    service = Api_spacesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create api_spaces")
        
        logger.info(f"Api_spaces created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating api_spaces: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating api_spaces: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Api_spacesResponse], status_code=201)
async def create_api_spacess_batch(
    request: Api_spacesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple api_spacess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} api_spacess")
    
    service = Api_spacesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} api_spacess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Api_spacesResponse])
async def update_api_spacess_batch(
    request: Api_spacesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple api_spacess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} api_spacess")
    
    service = Api_spacesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} api_spacess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Api_spacesResponse)
async def update_api_spaces(
    id: int,
    data: Api_spacesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing api_spaces"""
    logger.debug(f"Updating api_spaces {id} with data: {data}")

    service = Api_spacesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Api_spaces with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Api_spaces not found")
        
        logger.info(f"Api_spaces {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating api_spaces {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating api_spaces {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{id}/set_active")
async def set_active_api_spaces(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Set this api_spaces as active for its platform, deactivating others on the same platform."""
    from sqlalchemy import update, select
    from models.api_spaces import Api_spaces

    service = Api_spacesService(db)
    target = await service.get_by_id(id)
    if not target:
        raise HTTPException(status_code=404, detail="Api_spaces not found")

    try:
        # Deactivate others on the same platform
        await db.execute(
            update(Api_spaces)
            .where(Api_spaces.platform == target.platform)
            .values(is_active=False)
        )
        # Activate this one
        await db.execute(
            update(Api_spaces)
            .where(Api_spaces.id == id)
            .values(is_active=True, test_status="active")
        )
        await db.commit()
        refreshed = await service.get_by_id(id)
        logger.info(f"Api_spaces {id} set active for platform {target.platform}")
        return {"message": "Active API Space updated", "id": id, "platform": target.platform, "is_active": True}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error setting active api_spaces {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to set active: {str(e)}")


@router.post("/{id}/test")
async def test_api_spaces(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Mock-test connection to the Apify API represented by this record."""
    service = Api_spacesService(db)
    target = await service.get_by_id(id)
    if not target:
        raise HTTPException(status_code=404, detail="Api_spaces not found")

    try:
        from datetime import datetime as _dt
        has_token = bool((target.api_token_encrypted or "").strip())
        status_value = "active" if has_token else "failed"
        await service.update(id, {
            "last_tested_at": _dt.utcnow().isoformat(),
            "test_status": status_value,
        })
        refreshed = await service.get_by_id(id)
        return {
            "id": id,
            "test_status": status_value,
            "last_tested_at": refreshed.last_tested_at,
            "ok": has_token,
            "message": "Connection test succeeded" if has_token else "No token provided; test failed",
        }
    except Exception as e:
        logger.error(f"Error testing api_spaces {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


@router.delete("/batch")
async def delete_api_spacess_batch(
    request: Api_spacesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple api_spacess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} api_spacess")
    
    service = Api_spacesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} api_spacess successfully")
        return {"message": f"Successfully deleted {deleted_count} api_spacess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_api_spaces(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single api_spaces by ID"""
    logger.debug(f"Deleting api_spaces with id: {id}")
    
    service = Api_spacesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Api_spaces with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Api_spaces not found")
        
        logger.info(f"Api_spaces {id} deleted successfully")
        return {"message": "Api_spaces deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting api_spaces {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")