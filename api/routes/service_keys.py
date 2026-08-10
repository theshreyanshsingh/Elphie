from typing import List

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from api.constants import DEPLOYMENT_MODE
from api.db.models import UserModel
from api.schemas.service_key import (
    CreateServiceKeyRequest,
    CreateServiceKeyResponse,
    ServiceKeyResponse,
)
from api.services.auth.depends import get_user
from api.services.mps_service_key_client import mps_service_key_client

router = APIRouter()


@router.get("/user/service-keys", response_model=List[ServiceKeyResponse])
async def get_service_keys(
    include_archived: bool = False,
    user: UserModel = Depends(get_user),
):
    """Get all service keys for the user's organization."""
    try:
        # For self-hosted mode, use provider_id as created_by
        # For authenticated mode, use organization_id
        if DEPLOYMENT_MODE == "selfhosted":
            service_keys = await mps_service_key_client.get_service_keys(
                created_by=str(user.provider_id),
                include_archived=include_archived,
            )
        else:
            if not user.selected_organization_id:
                raise HTTPException(status_code=400, detail="No organization selected")

            service_keys = await mps_service_key_client.get_service_keys(
                organization_id=user.selected_organization_id,
                include_archived=include_archived,
            )

        return [ServiceKeyResponse.model_validate(key) for key in service_keys]
    except Exception as e:
        # Managed service-key catalog lives on MPS. self-host often has no
        # reachable MPS_API_URL — return an empty list so the API Keys page loads.
        if DEPLOYMENT_MODE == "selfhosted":
            logger.warning(
                "Service key catalog unavailable in self-hosted ({}). Returning empty list.",
                e,
            )
            return []
        logger.error(f"Failed to get service keys: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve service keys")


@router.post("/user/service-keys", response_model=CreateServiceKeyResponse)
async def create_service_key(
    request: CreateServiceKeyRequest,
    user: UserModel = Depends(get_user),
):
    """Create a new service key for the user's organization."""
    try:
        # For self-hosted mode, don't pass organization_id
        # For authenticated mode, pass organization_id
        if DEPLOYMENT_MODE == "selfhosted":
            result = await mps_service_key_client.create_service_key(
                name=request.name,
                created_by=str(user.provider_id),
                expires_in_days=request.expires_in_days or 90,
                description=f"Service key: {request.name}",
            )
        else:
            if not user.selected_organization_id:
                raise HTTPException(status_code=400, detail="No organization selected")

            result = await mps_service_key_client.create_service_key(
                name=request.name,
                organization_id=user.selected_organization_id,
                created_by=str(user.provider_id),
                expires_in_days=request.expires_in_days or 90,
                description=f"Service key for organization {user.selected_organization_id}",
            )

        return CreateServiceKeyResponse.model_validate(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create service key: {e}")
        if DEPLOYMENT_MODE == "selfhosted":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Managed Elphie service keys require a reachable MPS_API_URL. "
                    "Configure your own provider API keys under Models instead."
                ),
            )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create service key: {str(e)}",
        )


@router.delete("/user/service-keys/{service_key_id}")
async def archive_service_key(
    service_key_id: str,  # Changed from int to str since MPS uses string IDs
    user: UserModel = Depends(get_user),
):
    """Archive a service key."""
    try:
        # For self-hosted mode, use provider_id as created_by for validation
        # For authenticated mode, use organization_id for validation
        if DEPLOYMENT_MODE == "selfhosted":
            success = await mps_service_key_client.archive_service_key(
                key_id=service_key_id,
                created_by=str(user.provider_id),
            )
        else:
            if not user.selected_organization_id:
                raise HTTPException(status_code=400, detail="No organization selected")

            success = await mps_service_key_client.archive_service_key(
                key_id=service_key_id,
                organization_id=user.selected_organization_id,
            )

        if not success:
            raise HTTPException(
                status_code=404,
                detail="Service key not found, already archived, or access denied",
            )

        return {"message": "Service key archived successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to archive service key: {e}")
        if DEPLOYMENT_MODE == "selfhosted":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Managed Elphie service keys require a reachable MPS_API_URL. "
                    "This action is unavailable on self-hosted deployments without MPS."
                ),
            )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to archive service key: {str(e)}",
        )


@router.put("/user/service-keys/{service_key_id}/reactivate")
async def reactivate_service_key(
    service_key_id: str,  # Changed from int to str since MPS uses string IDs
    user: UserModel = Depends(get_user),  # Kept for consistency but not used
):
    """
    Reactivate an archived service key.

    Note: This endpoint is provided for API compatibility but service key
    reactivation is not supported by MPS. Once archived, a service key
    cannot be reactivated and a new key must be created instead.
    """
    # MPS does not support reactivation of archived service keys
    raise HTTPException(
        status_code=501,  # Not Implemented
        detail="Service key reactivation is not supported. Once a service key is archived, it cannot be reactivated. Please create a new service key instead.",
    )
