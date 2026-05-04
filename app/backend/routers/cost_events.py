import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.cost_events import Cost_eventsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/cost_events", tags=["cost_events"])


# ---------- Pydantic Schemas ----------
class Cost_eventsData(BaseModel):
    """Entity data schema (for create/update)"""
    service: str
    cost_center: str = None
    category: str = None
    tokens_input: int = None
    tokens_output: int = None
    cost_usd: float
    model_used: str = None
    event_meta: str = None


class Cost_eventsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    service: Optional[str] = None
    cost_center: Optional[str] = None
    category: Optional[str] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    cost_usd: Optional[float] = None
    model_used: Optional[str] = None
    event_meta: Optional[str] = None


class Cost_eventsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    service: str
    cost_center: Optional[str] = None
    category: Optional[str] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    cost_usd: float
    model_used: Optional[str] = None
    event_meta: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Cost_eventsListResponse(BaseModel):
    """List response schema"""
    items: List[Cost_eventsResponse]
    total: int
    skip: int
    limit: int


class Cost_eventsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Cost_eventsData]


class Cost_eventsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Cost_eventsUpdateData


class Cost_eventsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Cost_eventsBatchUpdateItem]


class Cost_eventsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Cost_eventsListResponse)
async def query_cost_eventss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query cost_eventss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying cost_eventss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Cost_eventsService(db)
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
        logger.debug(f"Found {result['total']} cost_eventss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying cost_eventss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Cost_eventsListResponse)
async def query_cost_eventss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query cost_eventss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying cost_eventss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Cost_eventsService(db)
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
        logger.debug(f"Found {result['total']} cost_eventss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying cost_eventss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Cost_eventsResponse)
async def get_cost_events(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single cost_events by ID (user can only see their own records)"""
    logger.debug(f"Fetching cost_events with id: {id}, fields={fields}")
    
    service = Cost_eventsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Cost_events with id {id} not found")
            raise HTTPException(status_code=404, detail="Cost_events not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching cost_events {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Cost_eventsResponse, status_code=201)
async def create_cost_events(
    data: Cost_eventsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new cost_events"""
    logger.debug(f"Creating new cost_events with data: {data}")
    
    service = Cost_eventsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create cost_events")
        
        logger.info(f"Cost_events created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating cost_events: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating cost_events: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Cost_eventsResponse], status_code=201)
async def create_cost_eventss_batch(
    request: Cost_eventsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple cost_eventss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} cost_eventss")
    
    service = Cost_eventsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} cost_eventss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Cost_eventsResponse])
async def update_cost_eventss_batch(
    request: Cost_eventsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple cost_eventss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} cost_eventss")
    
    service = Cost_eventsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} cost_eventss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Cost_eventsResponse)
async def update_cost_events(
    id: int,
    data: Cost_eventsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing cost_events (requires ownership)"""
    logger.debug(f"Updating cost_events {id} with data: {data}")

    service = Cost_eventsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Cost_events with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Cost_events not found")
        
        logger.info(f"Cost_events {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating cost_events {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating cost_events {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_cost_eventss_batch(
    request: Cost_eventsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple cost_eventss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} cost_eventss")
    
    service = Cost_eventsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} cost_eventss successfully")
        return {"message": f"Successfully deleted {deleted_count} cost_eventss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_cost_events(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single cost_events by ID (requires ownership)"""
    logger.debug(f"Deleting cost_events with id: {id}")
    
    service = Cost_eventsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Cost_events with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Cost_events not found")
        
        logger.info(f"Cost_events {id} deleted successfully")
        return {"message": "Cost_events deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting cost_events {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")