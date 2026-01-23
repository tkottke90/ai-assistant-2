from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional

from ...config import ConfigManager, get_config_manager, BaseConfig
from ...logging import get_logger

logger = get_logger("controllers.config")


router = APIRouter(prefix="/config", tags=["configuration"])


# Request/Response Models
class UpdateConfigRequest(BaseModel):
    """Request model for updating configuration"""

    updates: Dict[str, Any]


class ConfigResponse(BaseModel):
    """Response model for configuration operations"""

    feature: str
    config: Dict[str, Any]
    requires_restart: bool


class AllConfigsResponse(BaseModel):
    """Response model for all configurations"""

    configs: Dict[str, Dict[str, Any]]


class ResetResponse(BaseModel):
    """Response model for reset operation"""

    message: str
    configs: Dict[str, Dict[str, Any]]


class RefreshResponse(BaseModel):
    """Response model for refresh operations"""

    message: str
    refreshed_features: list[str]
    changes_detected: Dict[str, bool]
    restart_required: Dict[str, bool]


class FeatureRefreshResponse(BaseModel):
    """Response model for feature-specific refresh"""

    message: str
    feature: str
    changes_detected: bool
    requires_restart: bool
    config: Dict[str, Any]


class SchemaResponse(BaseModel):
    """Response model for schema endpoint"""

    schemas: Dict[str, Any]


# Endpoints
@router.get("", response_model=AllConfigsResponse)
def get_all_configs(
    config_manager: ConfigManager = Depends(get_config_manager),
) -> AllConfigsResponse:
    """
    Get all feature configurations

    Returns all configuration settings for all features.
    """
    try:
        all_configs = config_manager.get_all_configs()
        configs_dict = {
            feature: config.model_dump() for feature, config in all_configs.items()
        }
        return AllConfigsResponse(configs=configs_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get configs: {str(e)}")


@router.get("/{feature}", response_model=ConfigResponse)
def get_feature_config(
    feature: str,
    reload: bool = Query(False, description="Force reload from disk"),
    config_manager: ConfigManager = Depends(get_config_manager),
) -> ConfigResponse:
    """
    Get configuration for a specific feature

    Args:
        feature: Feature name (server, cors, llm)
        reload: Force reload from disk (default: False)
    """
    try:
        config = config_manager.get_config(feature, reload=reload)
        return ConfigResponse(
            feature=feature,
            config=config.model_dump(),
            requires_restart=config_manager.requires_restart(feature),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get config for {feature}: {str(e)}"
        )


@router.put("/{feature}", response_model=ConfigResponse)
def update_feature_config(
    feature: str,
    request: UpdateConfigRequest,
    config_manager: ConfigManager = Depends(get_config_manager),
) -> ConfigResponse:
    """
    Update configuration for a specific feature

    Args:
        feature: Feature name (server, cors, llm)
        request: Update request containing the updates dictionary
    """
    try:
        logger.info("Updating configuration for feature: %s", feature, extra={"updates": request.updates})
        updated_config = config_manager.update_config(feature, request.updates)
        requires_restart = config_manager.requires_restart(feature)

        if requires_restart:
            logger.warning("Configuration update for '%s' requires application restart", feature)

        return ConfigResponse(
            feature=feature,
            config=updated_config.model_dump(),
            requires_restart=requires_restart,
        )
    except ValueError as e:
        logger.error("Feature not found: %s", feature)
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to update config for %s: %s", feature, e, exc_info=True)
        raise HTTPException(
            status_code=400, detail=f"Failed to update config for {feature}: {str(e)}"
        )


@router.post("/reset", response_model=ResetResponse)
def reset_all_configs(
    config_manager: ConfigManager = Depends(get_config_manager),
) -> ResetResponse:
    """
    Reset all configurations to defaults

    WARNING: This will reset all configuration settings to their default values.
    """
    try:
        logger.warning("Resetting all configurations to defaults")
        default_configs = config_manager.reset_to_defaults()
        configs_dict = {
            feature: config.model_dump() for feature, config in default_configs.items()
        }
        logger.info("All configurations reset to defaults successfully")
        return ResetResponse(
            message="All configurations reset to defaults", configs=configs_dict
        )
    except Exception as e:
        logger.error("Failed to reset configs: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to reset configs: {str(e)}"
        )


@router.post("/refresh", response_model=RefreshResponse)
def refresh_all_configs(
    config_manager: ConfigManager = Depends(get_config_manager),
) -> RefreshResponse:
    """
    Reload all configurations from disk

    Use this endpoint after manually editing the config.yaml file
    to reload all configurations without restarting the application.
    """
    try:
        logger.info("Refreshing all configurations from disk")
        result = config_manager.reload_all_from_disk()

        # Determine which features require restart
        restart_required = {}
        for feature in result["refreshed_features"]:
            restart_required[feature] = config_manager.requires_restart(feature)
            if result["changes_detected"].get(feature, False):
                logger.info("Configuration changes detected for feature: %s", feature)

        return RefreshResponse(
            message="All configurations reloaded from disk",
            refreshed_features=result["refreshed_features"],
            changes_detected=result["changes_detected"],
            restart_required=restart_required,
        )
    except Exception as e:
        logger.error("Failed to refresh configs: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to refresh configs: {str(e)}"
        )


@router.post("/{feature}/refresh", response_model=FeatureRefreshResponse)
def refresh_feature_config(
    feature: str,
    config_manager: ConfigManager = Depends(get_config_manager),
) -> FeatureRefreshResponse:
    """
    Reload specific feature configuration from disk

    Use this endpoint after manually editing the config.yaml file
    to reload a specific feature's configuration without restarting.

    Args:
        feature: Feature name (server, cors, llm)
    """
    try:
        result = config_manager.reload_feature_from_disk(feature)

        return FeatureRefreshResponse(
            message=f"Configuration for '{feature}' reloaded from disk",
            feature=feature,
            changes_detected=result["changes_detected"],
            requires_restart=config_manager.requires_restart(feature),
            config=result["config"].model_dump(),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh config for {feature}: {str(e)}",
        )


@router.get("/schema", response_model=SchemaResponse)
def get_config_schema(
    config_manager: ConfigManager = Depends(get_config_manager),
) -> SchemaResponse:
    """
    Get JSON schema for all configurations

    Returns the JSON schema for all configuration models.
    Useful for generating UI forms or validating configurations.
    """
    try:
        schemas = config_manager.get_schema()
        return SchemaResponse(schemas=schemas)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get schemas: {str(e)}"
        )

