from pydantic import BaseModel, model_validator, ConfigDict
from typing import ClassVar, Dict, Any
import logging


class BaseConfig(BaseModel):
    """Base class for all configuration models"""

    # Class variable to indicate if changes require restart
    requires_restart: ClassVar[bool] = False

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="allow",  # Forward compatibility
        use_enum_values=True,
    )

    @model_validator(mode='before')
    @classmethod
    def migrate_deprecated_fields(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Automatically migrate deprecated fields to their replacements

        Rules:
        1. If deprecated field has a 'replacement' in metadata, migrate the value
        2. If no replacement, keep the field as-is (backward compatibility)
        3. Log warnings for all deprecated fields found
        4. Remove deprecated field from data after migration

        Args:
            data: Raw configuration data before validation

        Returns:
            Modified configuration data with migrations applied
        """
        if not isinstance(data, dict):
            return data

        # Iterate through all fields in the model
        for field_name, field_info in cls.model_fields.items():
            # Check if field is deprecated and present in data
            if field_info.deprecated and field_name in data:
                # Get metadata
                metadata = field_info.json_schema_extra or {}
                replacement = metadata.get('replacement')
                deprecated_since = metadata.get('deprecated_since', 'unknown')
                removed_in = metadata.get('removed_in', 'future version')

                # Get logger (use basic logger if logging system not configured yet)
                logger = logging.getLogger("ai_assistant.config.models")

                if replacement:
                    # Migration path exists
                    if replacement not in data:
                        # Migrate the value
                        data[replacement] = data[field_name]
                        logger.warning("Migrated deprecated field '%s' -> '%s'", field_name, replacement)
                        logger.warning("  Deprecated since: %s, will be removed in: %s", deprecated_since, removed_in)
                        logger.warning("  Please update your config file to use '%s'", replacement)
                    else:
                        # Both old and new exist - prefer new
                        logger.warning("Found both '%s' (deprecated) and '%s' in config", field_name, replacement)
                        logger.warning("  Using '%s' value, ignoring deprecated '%s'", replacement, field_name)

                    # Remove deprecated field after migration
                    del data[field_name]
                else:
                    # No replacement - field is deprecated but still functional
                    logger.warning("Using deprecated field '%s'", field_name)
                    logger.warning("  Deprecated since: %s, will be removed in: %s", deprecated_since, removed_in)
                    logger.warning("  No replacement available - this field will be removed entirely")

        return data

