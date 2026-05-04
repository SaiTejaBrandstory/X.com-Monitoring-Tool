import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.rewritten_outputs import Rewritten_outputsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/rewritten_outputs", tags=["rewritten_outputs"])


# ---------- Pydantic Schemas ----------
class Rewritten_outputsData(BaseModel):
    """Entity data schema (for create/update)"""
    saved_post_id: int = None
    persona_id: int = None
    original_content: str = None
    original_hook: str = None
    rewritten_content: str
    word_count: int = None
    char_count: int = None
    platform_target: str = None
    version: int = None
    lock_hook: bool = None
    max_words: int = None
    max_chars: int = None
    model_used: str = None
    tokens_input: int = None
    tokens_output: int = None


class Rewritten_outputsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    saved_post_id: Optional[int] = None
    persona_id: Optional[int] = None
    original_content: Optional[str] = None
    original_hook: Optional[str] = None
    rewritten_content: Optional[str] = None
    word_count: Optional[int] = None
    char_count: Optional[int] = None
    platform_target: Optional[str] = None
    version: Optional[int] = None
    lock_hook: Optional[bool] = None
    max_words: Optional[int] = None
    max_chars: Optional[int] = None
    model_used: Optional[str] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None


class Rewritten_outputsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    saved_post_id: Optional[int] = None
    persona_id: Optional[int] = None
    original_content: Optional[str] = None
    original_hook: Optional[str] = None
    rewritten_content: str
    word_count: Optional[int] = None
    char_count: Optional[int] = None
    platform_target: Optional[str] = None
    version: Optional[int] = None
    lock_hook: Optional[bool] = None
    max_words: Optional[int] = None
    max_chars: Optional[int] = None
    model_used: Optional[str] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Rewritten_outputsListResponse(BaseModel):
    """List response schema"""
    items: List[Rewritten_outputsResponse]
    total: int
    skip: int
    limit: int


class Rewritten_outputsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Rewritten_outputsData]


class Rewritten_outputsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Rewritten_outputsUpdateData


class Rewritten_outputsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Rewritten_outputsBatchUpdateItem]


class Rewritten_outputsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Rewritten_outputsListResponse)
async def query_rewritten_outputss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query rewritten_outputss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying rewritten_outputss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Rewritten_outputsService(db)
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
        logger.debug(f"Found {result['total']} rewritten_outputss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying rewritten_outputss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Rewritten_outputsListResponse)
async def query_rewritten_outputss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query rewritten_outputss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying rewritten_outputss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Rewritten_outputsService(db)
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
        logger.debug(f"Found {result['total']} rewritten_outputss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying rewritten_outputss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Rewritten_outputsResponse)
async def get_rewritten_outputs(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single rewritten_outputs by ID (user can only see their own records)"""
    logger.debug(f"Fetching rewritten_outputs with id: {id}, fields={fields}")
    
    service = Rewritten_outputsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Rewritten_outputs with id {id} not found")
            raise HTTPException(status_code=404, detail="Rewritten_outputs not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching rewritten_outputs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Rewritten_outputsResponse, status_code=201)
async def create_rewritten_outputs(
    data: Rewritten_outputsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new rewritten_outputs"""
    logger.debug(f"Creating new rewritten_outputs with data: {data}")
    
    service = Rewritten_outputsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create rewritten_outputs")
        
        logger.info(f"Rewritten_outputs created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating rewritten_outputs: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating rewritten_outputs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Rewritten_outputsResponse], status_code=201)
async def create_rewritten_outputss_batch(
    request: Rewritten_outputsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple rewritten_outputss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} rewritten_outputss")
    
    service = Rewritten_outputsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} rewritten_outputss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Rewritten_outputsResponse])
async def update_rewritten_outputss_batch(
    request: Rewritten_outputsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple rewritten_outputss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} rewritten_outputss")
    
    service = Rewritten_outputsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} rewritten_outputss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Rewritten_outputsResponse)
async def update_rewritten_outputs(
    id: int,
    data: Rewritten_outputsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing rewritten_outputs (requires ownership)"""
    logger.debug(f"Updating rewritten_outputs {id} with data: {data}")

    service = Rewritten_outputsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Rewritten_outputs with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Rewritten_outputs not found")
        
        logger.info(f"Rewritten_outputs {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating rewritten_outputs {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating rewritten_outputs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_rewritten_outputss_batch(
    request: Rewritten_outputsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple rewritten_outputss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} rewritten_outputss")
    
    service = Rewritten_outputsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} rewritten_outputss successfully")
        return {"message": f"Successfully deleted {deleted_count} rewritten_outputss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_rewritten_outputs(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single rewritten_outputs by ID (requires ownership)"""
    logger.debug(f"Deleting rewritten_outputs with id: {id}")
    
    service = Rewritten_outputsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Rewritten_outputs with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Rewritten_outputs not found")
        
        logger.info(f"Rewritten_outputs {id} deleted successfully")
        return {"message": "Rewritten_outputs deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting rewritten_outputs {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")