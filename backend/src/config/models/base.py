from pydantic import BaseModel, model_validator
from typing import ClassVar, Dict, Any


class BaseConfig(BaseModel):
    """Base class for all configuration models"""

    # Class variable to indicate if changes require restart
    requires_restart: ClassVar[bool] = False

    class Config:
        extra = "allow"  # Forward compatibility
        use_enum_values = True

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

                if replacement:
                    # Migration path exists
                    if replacement not in data:
                        # Migrate the value
                        data[replacement] = data[field_name]
                        print(f"⚠️  Migrated deprecated field '{field_name}' -> '{replacement}'")
                        print(f"   Deprecated since: {deprecated_since}, will be removed in: {removed_in}")
                        print(f"   Please update your config file to use '{replacement}'")
                    else:
                        # Both old and new exist - prefer new
                        print(f"⚠️  Found both '{field_name}' (deprecated) and '{replacement}' in config")
                        print(f"   Using '{replacement}' value, ignoring deprecated '{field_name}'")

                    # Remove deprecated field after migration
                    del data[field_name]
                else:
                    # No replacement - field is deprecated but still functional
                    print(f"⚠️  Using deprecated field '{field_name}'")
                    print(f"   Deprecated since: {deprecated_since}, will be removed in: {removed_in}")
                    print(f"   No replacement available - this field will be removed entirely")

        return data

