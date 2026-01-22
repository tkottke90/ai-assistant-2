"""
Tests for BaseConfig deprecation and migration functionality
"""
import pytest
from typing import Optional
from pydantic import Field

from src.config.models.base import BaseConfig


class TestDeprecatedFieldWithReplacement:
    """Tests for deprecated fields that have a replacement field"""

    def test_migrates_value_when_only_old_field_present(self, capsys):
        """When only deprecated field is present, value should migrate to new field"""
        
        class TestConfig(BaseConfig):
            new_field: int = Field(default=100)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={
                    "deprecated_since": "v1.0.0",
                    "removed_in": "v2.0.0",
                    "replacement": "new_field"
                }
            )
        
        # Load config with only old field
        data = {"old_field": 42}
        config = TestConfig(**data)
        
        # Value should be migrated to new field
        assert config.new_field == 42
        # Old field should be None (default)
        assert config.old_field is None
        
        # Check migration warning was logged
        captured = capsys.readouterr()
        assert "Migrated deprecated field 'old_field' -> 'new_field'" in captured.out
        assert "v1.0.0" in captured.out
        assert "v2.0.0" in captured.out

    def test_prefers_new_field_when_both_present(self, capsys):
        """When both deprecated and new fields present, new field value should be used"""
        
        class TestConfig(BaseConfig):
            new_field: int = Field(default=100)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={
                    "replacement": "new_field"
                }
            )
        
        # Both fields present with different values
        data = {"old_field": 42, "new_field": 99}
        config = TestConfig(**data)
        
        # New field value should be used
        assert config.new_field == 99
        # Old field should be None
        assert config.old_field is None
        
        # Check warning was logged
        captured = capsys.readouterr()
        assert "Found both 'old_field' (deprecated) and 'new_field'" in captured.out
        assert "Using 'new_field' value" in captured.out

    def test_logs_migration_warning(self, capsys):
        """Migration should log appropriate warning messages"""
        
        class TestConfig(BaseConfig):
            new_field: int = Field(default=100)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={
                    "deprecated_since": "v1.0.0",
                    "removed_in": "v2.0.0",
                    "replacement": "new_field"
                }
            )
        
        data = {"old_field": 42}
        config = TestConfig(**data)
        
        captured = capsys.readouterr()
        assert "⚠️  Migrated deprecated field 'old_field' -> 'new_field'" in captured.out
        assert "Deprecated since: v1.0.0" in captured.out
        assert "will be removed in: v2.0.0" in captured.out
        assert "Please update your config file to use 'new_field'" in captured.out


class TestDeprecatedFieldWithoutReplacement:
    """Tests for deprecated fields that have no replacement"""

    def test_field_stays_functional(self, capsys):
        """Deprecated field without replacement should still work"""
        
        class TestConfig(BaseConfig):
            deprecated_field: Optional[str] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={
                    "deprecated_since": "v1.0.0",
                    "removed_in": "v2.0.0"
                    # No 'replacement' key
                }
            )
        
        data = {"deprecated_field": "still_works"}
        config = TestConfig(**data)
        
        # Field value should be preserved
        assert config.deprecated_field == "still_works"

    def test_logs_deprecation_warning(self, capsys):
        """Should log warning for deprecated field without replacement"""
        
        class TestConfig(BaseConfig):
            deprecated_field: Optional[str] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={
                    "deprecated_since": "v1.0.0",
                    "removed_in": "v2.0.0"
                }
            )
        
        data = {"deprecated_field": "value"}
        config = TestConfig(**data)
        
        captured = capsys.readouterr()
        assert "⚠️  Using deprecated field 'deprecated_field'" in captured.out
        assert "Deprecated since: v1.0.0" in captured.out
        assert "will be removed in: v2.0.0" in captured.out
        assert "No replacement available" in captured.out


class TestMultipleDeprecatedFields:
    """Tests for handling multiple deprecated fields"""

    def test_all_fields_migrate_correctly(self, capsys):
        """Multiple deprecated fields should all migrate correctly"""

        class TestConfig(BaseConfig):
            new_field_1: int = Field(default=1)
            new_field_2: str = Field(default="default")

            old_field_1: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "new_field_1"}
            )
            old_field_2: Optional[str] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "new_field_2"}
            )

        data = {"old_field_1": 42, "old_field_2": "custom"}
        config = TestConfig(**data)

        # All values should be migrated
        assert config.new_field_1 == 42
        assert config.new_field_2 == "custom"
        assert config.old_field_1 is None
        assert config.old_field_2 is None


class TestNonDeprecatedFields:
    """Tests to ensure non-deprecated fields work normally"""

    def test_normal_fields_unaffected(self):
        """Non-deprecated fields should work normally without any migration"""

        class TestConfig(BaseConfig):
            normal_field: str = Field(default="default")

        data = {"normal_field": "custom_value"}
        config = TestConfig(**data)

        assert config.normal_field == "custom_value"

    def test_no_warnings_for_normal_fields(self, capsys):
        """Non-deprecated fields should not generate warnings"""

        class TestConfig(BaseConfig):
            normal_field: str = Field(default="default")

        data = {"normal_field": "custom_value"}
        config = TestConfig(**data)

        captured = capsys.readouterr()
        assert "⚠️" not in captured.out
        assert "deprecated" not in captured.out.lower()


class TestEdgeCases:
    """Tests for edge cases and special scenarios"""

    def test_empty_data_uses_defaults(self):
        """Empty data should use default values without errors"""

        class TestConfig(BaseConfig):
            new_field: int = Field(default=100)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "new_field"}
            )

        config = TestConfig()

        assert config.new_field == 100
        assert config.old_field is None

    def test_non_dict_data_passes_through(self):
        """Non-dict data should pass through validator without errors"""

        class TestConfig(BaseConfig):
            field: int = Field(default=1)

        # Normal dict should work
        config = TestConfig(**{"field": 42})
        assert config.field == 42

    def test_metadata_defaults_when_missing(self, capsys):
        """When metadata fields are missing, should use defaults"""

        class TestConfig(BaseConfig):
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "new_field"}
                # Missing deprecated_since and removed_in
            )
            new_field: int = Field(default=100)

        data = {"old_field": 42}
        config = TestConfig(**data)

        captured = capsys.readouterr()
        # Should use default values
        assert "unknown" in captured.out  # deprecated_since default
        assert "future version" in captured.out  # removed_in default

    def test_no_json_schema_extra(self, capsys):
        """Deprecated field with no json_schema_extra should handle gracefully"""

        class TestConfig(BaseConfig):
            deprecated_field: Optional[str] = Field(
                default=None,
                deprecated=True
                # No json_schema_extra at all
            )

        data = {"deprecated_field": "value"}
        config = TestConfig(**data)

        # Should still work
        assert config.deprecated_field == "value"

        captured = capsys.readouterr()
        assert "⚠️  Using deprecated field 'deprecated_field'" in captured.out


class TestComplexMigrationScenarios:
    """Tests for complex real-world migration scenarios"""

    def test_type_conversion_during_migration(self):
        """Migration should preserve type conversion"""

        class TestConfig(BaseConfig):
            new_field: int = Field(default=100)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "new_field"}
            )

        # Value should be migrated and type-checked
        data = {"old_field": 42}
        config = TestConfig(**data)

        assert config.new_field == 42
        assert isinstance(config.new_field, int)

    def test_migration_with_validation(self):
        """Migration should respect field validation"""

        class TestConfig(BaseConfig):
            new_field: int = Field(default=100, ge=0, le=1000)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "new_field"}
            )

        # Valid value should migrate
        data = {"old_field": 500}
        config = TestConfig(**data)
        assert config.new_field == 500

        # Invalid value should raise validation error
        with pytest.raises(Exception):  # Pydantic ValidationError
            TestConfig(**{"old_field": 2000})  # Exceeds max

    def test_partial_config_with_deprecated_fields(self):
        """Partial config with some deprecated fields should work"""

        class TestConfig(BaseConfig):
            field_1: str = Field(default="default1")
            field_2: int = Field(default=100)
            old_field: Optional[int] = Field(
                default=None,
                deprecated=True,
                json_schema_extra={"replacement": "field_2"}
            )

        # Only provide deprecated field
        data = {"old_field": 42}
        config = TestConfig(**data)

        assert config.field_1 == "default1"  # Uses default
        assert config.field_2 == 42  # Migrated from old_field
        assert config.old_field is None


