import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.config_keys import Config_keysService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/config_keys", tags=["config_keys"])


# ---------- Pydantic Schemas ----------
class Config_keysData(BaseModel):
    """Entity data schema (for create/update)"""
    key_name: str
    encrypted_value: str = None
    last_tested_at: str = None
    is_valid: bool = None
    updated_by: str = None


class Config_keysUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    key_name: Optional[str] = None
    encrypted_value: Optional[str] = None
    last_tested_at: Optional[str] = None
    is_valid: Optional[bool] = None
    updated_by: Optional[str] = None


class Config_keysResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    key_name: str
    encrypted_value: Optional[str] = None
    last_tested_at: Optional[str] = None
    is_valid: Optional[bool] = None
    updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Config_keysListResponse(BaseModel):
    """List response schema"""
    items: List[Config_keysResponse]
    total: int
    skip: int
    limit: int


class Config_keysBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Config_keysData]


class Config_keysBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Config_keysUpdateData


class Config_keysBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Config_keysBatchUpdateItem]


class Config_keysBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Config_keysListResponse)
async def query_config_keyss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query config_keyss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying config_keyss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Config_keysService(db)
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
        logger.debug(f"Found {result['total']} config_keyss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying config_keyss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Config_keysListResponse)
async def query_config_keyss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query config_keyss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying config_keyss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Config_keysService(db)
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
        logger.debug(f"Found {result['total']} config_keyss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying config_keyss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Config_keysResponse)
async def get_config_keys(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single config_keys by ID (user can only see their own records)"""
    logger.debug(f"Fetching config_keys with id: {id}, fields={fields}")
    
    service = Config_keysService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Config_keys with id {id} not found")
            raise HTTPException(status_code=404, detail="Config_keys not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching config_keys {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Config_keysResponse, status_code=201)
async def create_config_keys(
    data: Config_keysData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new config_keys"""
    logger.debug(f"Creating new config_keys with data: {data}")
    
    service = Config_keysService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create config_keys")
        
        logger.info(f"Config_keys created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating config_keys: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating config_keys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Config_keysResponse], status_code=201)
async def create_config_keyss_batch(
    request: Config_keysBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple config_keyss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} config_keyss")
    
    service = Config_keysService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} config_keyss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Config_keysResponse])
async def update_config_keyss_batch(
    request: Config_keysBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple config_keyss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} config_keyss")
    
    service = Config_keysService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} config_keyss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Config_keysResponse)
async def update_config_keys(
    id: int,
    data: Config_keysUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing config_keys (requires ownership)"""
    logger.debug(f"Updating config_keys {id} with data: {data}")

    service = Config_keysService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Config_keys with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Config_keys not found")
        
        logger.info(f"Config_keys {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating config_keys {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating config_keys {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_config_keyss_batch(
    request: Config_keysBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple config_keyss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} config_keyss")
    
    service = Config_keysService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} config_keyss successfully")
        return {"message": f"Successfully deleted {deleted_count} config_keyss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_config_keys(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single config_keys by ID (requires ownership)"""
    logger.debug(f"Deleting config_keys with id: {id}")
    
    service = Config_keysService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Config_keys with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Config_keys not found")
        
        logger.info(f"Config_keys {id} deleted successfully")
        return {"message": "Config_keys deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting config_keys {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")