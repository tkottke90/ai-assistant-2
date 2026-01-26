from pathlib import Path
from typing import Dict, Any, Optional, Type
from threading import RLock
import os
import logging

from .loader import ConfigLoader
from .models import BaseConfig, ServerConfig, CorsConfig, LLMConfig, LoggingConfig, NotificationsConfig


class ConfigManager:
    """Singleton configuration manager for the application"""

    _instance: Optional["ConfigManager"] = None
    _lock = RLock()

    def __new__(cls) -> "ConfigManager":
        """Ensure only one instance exists (singleton pattern)"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        """Initialize the configuration manager"""
        # Only initialize once
        if hasattr(self, "_initialized"):
            return

        # Determine config directory from environment or default
        config_dir = self._get_config_directory()
        self._config_path = config_dir / "config.yaml"

        # Initialize loader
        self._loader = ConfigLoader(self._config_path)

        # Configuration models registry
        self._config_models: Dict[str, Type[BaseConfig]] = {
            "server": ServerConfig,
            "cors": CorsConfig,
            "llm": LLMConfig,
            "logging": LoggingConfig,
            "notifications": NotificationsConfig,
        }

        # Cache for loaded configurations
        self._cache: Dict[str, BaseConfig] = {}

        # Lock for thread-safe operations
        self._operation_lock = RLock()

        # Generate default config file if it doesn't exist
        self._ensure_config_file_exists()

        self._initialized = True

    def _get_logger(self) -> logging.Logger:
        """
        Get logger for config manager

        Returns basic logger if logging system not configured yet,
        otherwise returns the configured logger
        """
        try:
            from ..logging import get_logger
            return get_logger("config.manager")
        except (ImportError, AttributeError):
            # Logging system not initialized yet, use basic logger
            return logging.getLogger("ai_assistant.config.manager")

    def _get_config_directory(self) -> Path:
        """
        Determine the configuration directory

        Priority:
        1. AI_ASSISTANT_CONFIG_DIR environment variable (absolute or relative path)
        2. Default: ~/.config/ai-assistant

        Returns:
            Path object for the config directory

        Note: Uses print() instead of logger because this is called during
        __init__ before logging system is configured
        """
        config_dir_env = os.getenv("AI_ASSISTANT_CONFIG_DIR")

        if config_dir_env:
            # Use fallback safe logging for early startup visibility
            try:
                from ..logging.fallback import safe_info

                safe_info(
                    f"AI_ASSISTANT_CONFIG_DIR is set to {config_dir_env}",
                    extra={"path": config_dir_env},
                    logger_name="ai_assistant.config.manager",
                )
            except Exception:
                # Fallback to print if anything goes wrong importing fallback
                print(f"AI_ASSISTANT_CONFIG_DIR is set to {config_dir_env}")
            config_dir = Path(config_dir_env)
            # If relative path, make it absolute from current working directory
            if not config_dir.is_absolute():
                config_dir = Path.cwd() / config_dir
        else:
            try:
                from ..logging.fallback import safe_info

                safe_info(
                    "AI_ASSISTANT_CONFIG_DIR is not set, using default config directory",
                    logger_name="ai_assistant.config.manager",
                )
            except Exception:
                print("AI_ASSISTANT_CONFIG_DIR is not set, using default config directory")
            # Default to XDG config directory
            config_dir = Path.home() / ".config" / "ai-assistant"

        return config_dir

    def get_config_path(self) -> Path:
        """
        Get the current configuration file path

        Returns:
            Path object for the config.yaml file
        """
        return self._config_path

    def _detect_deprecated_fields(self, feature: str, yaml_data: Dict[str, Any], model_class: Type[BaseConfig]) -> None:
        """
        Detect and log deprecated fields present in YAML config

        This runs BEFORE Pydantic validation, so we can see what's actually in the file
        before migration happens.

        Args:
            feature: Feature name (e.g., 'llm', 'server')
            yaml_data: Raw data from YAML file for this feature
            model_class: The Pydantic model class for this feature
        """
        deprecated_fields_found = []

        # Check each field in the YAML data
        for field_name in yaml_data.keys():
            # Check if this field exists in the model and is deprecated
            if field_name in model_class.model_fields:
                field_info = model_class.model_fields[field_name]
                if field_info.deprecated:
                    metadata = field_info.json_schema_extra or {}
                    deprecated_fields_found.append({
                        'name': field_name,
                        'replacement': metadata.get('replacement'),
                        'deprecated_since': metadata.get('deprecated_since', 'unknown'),
                        'removed_in': metadata.get('removed_in', 'future version')
                    })

        # Log findings
        if deprecated_fields_found:
            logger = self._get_logger()
            logger.warning("Deprecated fields detected in '%s' configuration:", feature)
            for field in deprecated_fields_found:
                if field['replacement']:
                    logger.warning("  • '%s' → use '%s' instead", field['name'], field['replacement'])
                else:
                    logger.warning("  • '%s' (no replacement, will be removed)", field['name'])
                logger.warning("    Deprecated since: %s, Removed in: %s", field['deprecated_since'], field['removed_in'])
            logger.warning("  Config file: %s", self._config_path)

    def _validate_all_configs_for_deprecations(self) -> None:
        """
        Check all configurations for deprecated fields on startup

        This provides a comprehensive report of all deprecations in use.
        """
        all_configs = self._loader.load()

        has_deprecations = False
        for feature, model_class in self._config_models.items():
            feature_data = all_configs.get(feature, {})
            if feature_data:
                # Check for deprecated fields (before migration)
                for field_name in feature_data.keys():
                    if field_name in model_class.model_fields:
                        if model_class.model_fields[field_name].deprecated:
                            has_deprecations = True
                            break

        if has_deprecations:
            logger = self._get_logger()
            logger.warning("=" * 70)
            logger.warning("DEPRECATION WARNINGS")
            logger.warning("=" * 70)

            for feature, model_class in self._config_models.items():
                feature_data = all_configs.get(feature, {})
                if feature_data:
                    self._detect_deprecated_fields(feature, feature_data, model_class)

            logger.warning("=" * 70)

    def _ensure_config_file_exists(self) -> None:
        """
        Ensure configuration file exists, creating it with defaults if needed

        This method is called during initialization to generate a default
        config file if one doesn't exist yet.

        Note: Uses print() instead of logger because this is called during
        __init__ before logging system is configured
        """
        if not self._config_path.exists():
            # Generate default configs from all registered models
            default_configs = {}
            for feature, model_class in self._config_models.items():
                # Create instance with defaults and convert to dict
                default_configs[feature] = model_class().model_dump()

            # Save to file
            self._loader.save(default_configs)
            try:
                from ..logging.fallback import safe_info

                safe_info(
                    f"✓ Created default configuration file at {self._config_path}",
                    extra={"path": str(self._config_path)},
                    logger_name="ai_assistant.config.manager",
                )
            except Exception:
                print(f"✓ Created default configuration file at {self._config_path}")

    def get_config(self, feature: str, reload: bool = False) -> BaseConfig:
        """
        Get configuration for a specific feature

        Args:
            feature: Feature name (e.g., 'server', 'cors', 'llm')
            reload: Force reload from disk

        Returns:
            Configuration object for the feature

        Raises:
            ValueError: If feature is not recognized
        """
        if feature not in self._config_models:
            raise ValueError(f"Unknown feature: {feature}")

        with self._operation_lock:
            # Return cached config if available and not forcing reload
            if not reload and feature in self._cache:
                return self._cache[feature]

            # Load all configs from file
            all_configs = self._loader.load()

            # Get config data for this feature
            feature_data = all_configs.get(feature, {})

            # Detect deprecated fields BEFORE creating instance (before migration)
            model_class = self._config_models[feature]
            if feature_data:
                self._detect_deprecated_fields(feature, feature_data, model_class)

            # Create config instance from model (migration happens here via BaseConfig validator)
            config = model_class(**feature_data)

            # Cache the config
            self._cache[feature] = config

            return config

    def update_config(self, feature: str, updates: Dict[str, Any]) -> BaseConfig:
        """
        Update configuration for a specific feature

        Args:
            feature: Feature name
            updates: Dictionary of updates to apply

        Returns:
            Updated configuration object

        Raises:
            ValueError: If feature is not recognized
        """
        if feature not in self._config_models:
            raise ValueError(f"Unknown feature: {feature}")

        with self._operation_lock:
            # Load current configs
            all_configs = self._loader.load()

            # Get current feature config
            current_data = all_configs.get(feature, {})

            # Merge updates
            updated_data = {**current_data, **updates}

            # Validate by creating model instance
            model_class = self._config_models[feature]
            updated_config = model_class(**updated_data)

            # Update in all_configs
            all_configs[feature] = updated_config.model_dump()

            # Save to file
            self._loader.save(all_configs)

            # Update cache
            self._cache[feature] = updated_config

            return updated_config

    def get_all_configs(self) -> Dict[str, BaseConfig]:
        """
        Get all feature configurations

        Returns:
            Dictionary mapping feature names to config objects
        """
        with self._operation_lock:
            result = {}
            for feature in self._config_models.keys():
                result[feature] = self.get_config(feature)
            return result

    def reset_to_defaults(self) -> Dict[str, BaseConfig]:
        """
        Reset all configurations to defaults

        Returns:
            Dictionary of default configurations
        """
        with self._operation_lock:
            # Create default configs
            default_configs = {}
            for feature, model_class in self._config_models.items():
                default_configs[feature] = model_class().model_dump()

            # Save defaults to file
            self._loader.save(default_configs)

            # Clear cache
            self._cache.clear()

            # Return as config objects
            return self.get_all_configs()

    def reload_all_from_disk(self) -> Dict[str, Dict[str, bool]]:
        """
        Reload all configurations from disk

        Returns:
            Dictionary with 'refreshed_features' and 'changes_detected'
        """
        with self._operation_lock:
            # Store old configs for change detection
            old_configs = {}
            for feature in self._config_models.keys():
                if feature in self._cache:
                    old_configs[feature] = self._cache[feature].model_dump()

            # Clear cache to force reload
            self._cache.clear()

            # Reload all configs
            new_configs = self.get_all_configs()

            # Detect changes
            changes_detected = {}
            for feature, new_config in new_configs.items():
                new_data = new_config.model_dump()
                old_data = old_configs.get(feature, {})
                changes_detected[feature] = new_data != old_data

            return {
                "refreshed_features": list(new_configs.keys()),
                "changes_detected": changes_detected,
            }

    def reload_feature_from_disk(self, feature: str) -> Dict[str, Any]:
        """
        Reload specific feature configuration from disk

        Args:
            feature: Feature name to reload

        Returns:
            Dictionary with reload information

        Raises:
            ValueError: If feature is not recognized
        """
        if feature not in self._config_models:
            raise ValueError(f"Unknown feature: {feature}")

        with self._operation_lock:
            # Store old config for change detection
            old_config = None
            if feature in self._cache:
                old_config = self._cache[feature].model_dump()

            # Remove from cache to force reload
            self._cache.pop(feature, None)

            # Reload config
            new_config = self.get_config(feature)

            # Detect changes
            new_data = new_config.model_dump()
            changes_detected = new_data != old_config if old_config else True

            return {
                "feature": feature,
                "changes_detected": changes_detected,
                "config": new_config,
            }

    def requires_restart(self, feature: str) -> bool:
        """
        Check if a feature configuration change requires restart

        Args:
            feature: Feature name

        Returns:
            True if restart is required, False otherwise

        Raises:
            ValueError: If feature is not recognized
        """
        if feature not in self._config_models:
            raise ValueError(f"Unknown feature: {feature}")

        model_class = self._config_models[feature]
        return model_class.requires_restart

    def get_schema(self) -> Dict[str, Any]:
        """
        Get JSON schema for all configurations

        Returns:
            Dictionary mapping feature names to their JSON schemas
        """
        schemas = {}
        for feature, model_class in self._config_models.items():
            schemas[feature] = model_class.model_json_schema()
        return schemas


def get_config_manager() -> ConfigManager:
    """
    Dependency function for FastAPI to inject ConfigManager

    Returns:
        ConfigManager singleton instance
    """
    return ConfigManager()

