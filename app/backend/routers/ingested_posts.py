import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.ingested_posts import Ingested_postsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/ingested_posts", tags=["ingested_posts"])


# ---------- Pydantic Schemas ----------
class Ingested_postsData(BaseModel):
    """Entity data schema (for create/update)"""
    profile_id: int = None
    platform: str
    author_handle: str = None
    author_name: str = None
    author_avatar: str = None
    content: str
    likes: int = None
    retweets: int = None
    replies: int = None
    engagement_score: float = None
    virality_trend: str = None
    posted_at: str = None
    raw_url: str = None
    post_extras: Optional[str] = None
    category_id: int = None
    is_new: bool = None


class Ingested_postsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    profile_id: Optional[int] = None
    platform: Optional[str] = None
    author_handle: Optional[str] = None
    author_name: Optional[str] = None
    author_avatar: Optional[str] = None
    content: Optional[str] = None
    likes: Optional[int] = None
    retweets: Optional[int] = None
    replies: Optional[int] = None
    engagement_score: Optional[float] = None
    virality_trend: Optional[str] = None
    posted_at: Optional[str] = None
    raw_url: Optional[str] = None
    post_extras: Optional[str] = None
    category_id: Optional[int] = None
    is_new: Optional[bool] = None


class Ingested_postsResponse(BaseModel):
    """Entity response schema"""
    id: int
    profile_id: Optional[int] = None
    platform: str
    author_handle: Optional[str] = None
    author_name: Optional[str] = None
    author_avatar: Optional[str] = None
    content: str
    likes: Optional[int] = None
    retweets: Optional[int] = None
    replies: Optional[int] = None
    engagement_score: Optional[float] = None
    virality_trend: Optional[str] = None
    posted_at: Optional[str] = None
    raw_url: Optional[str] = None
    post_extras: Optional[str] = None
    category_id: Optional[int] = None
    is_new: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Ingested_postsListResponse(BaseModel):
    """List response schema"""
    items: List[Ingested_postsResponse]
    total: int
    skip: int
    limit: int


class Ingested_postsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Ingested_postsData]


class Ingested_postsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Ingested_postsUpdateData


class Ingested_postsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Ingested_postsBatchUpdateItem]


class Ingested_postsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Ingested_postsListResponse)
async def query_ingested_postss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query ingested_postss with filtering, sorting, and pagination"""
    logger.debug(f"Querying ingested_postss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Ingested_postsService(db)
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
        logger.debug(f"Found {result['total']} ingested_postss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying ingested_postss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Ingested_postsListResponse)
async def query_ingested_postss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query ingested_postss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying ingested_postss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Ingested_postsService(db)
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
        logger.debug(f"Found {result['total']} ingested_postss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying ingested_postss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Ingested_postsResponse)
async def get_ingested_posts(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single ingested_posts by ID"""
    logger.debug(f"Fetching ingested_posts with id: {id}, fields={fields}")
    
    service = Ingested_postsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Ingested_posts with id {id} not found")
            raise HTTPException(status_code=404, detail="Ingested_posts not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ingested_posts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Ingested_postsResponse, status_code=201)
async def create_ingested_posts(
    data: Ingested_postsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new ingested_posts"""
    logger.debug(f"Creating new ingested_posts with data: {data}")
    
    service = Ingested_postsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create ingested_posts")
        
        logger.info(f"Ingested_posts created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating ingested_posts: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating ingested_posts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Ingested_postsResponse], status_code=201)
async def create_ingested_postss_batch(
    request: Ingested_postsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple ingested_postss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} ingested_postss")
    
    service = Ingested_postsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} ingested_postss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Ingested_postsResponse])
async def update_ingested_postss_batch(
    request: Ingested_postsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple ingested_postss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} ingested_postss")
    
    service = Ingested_postsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} ingested_postss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Ingested_postsResponse)
async def update_ingested_posts(
    id: int,
    data: Ingested_postsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing ingested_posts"""
    logger.debug(f"Updating ingested_posts {id} with data: {data}")

    service = Ingested_postsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Ingested_posts with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Ingested_posts not found")
        
        logger.info(f"Ingested_posts {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating ingested_posts {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating ingested_posts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_ingested_postss_batch(
    request: Ingested_postsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple ingested_postss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} ingested_postss")
    
    service = Ingested_postsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} ingested_postss successfully")
        return {"message": f"Successfully deleted {deleted_count} ingested_postss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_ingested_posts(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single ingested_posts by ID"""
    logger.debug(f"Deleting ingested_posts with id: {id}")
    
    service = Ingested_postsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Ingested_posts with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Ingested_posts not found")
        
        logger.info(f"Ingested_posts {id} deleted successfully")
        return {"message": "Ingested_posts deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ingested_posts {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")