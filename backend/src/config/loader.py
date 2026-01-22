from pathlib import Path
from typing import Dict, Any
import yaml
from threading import Lock


class ConfigLoader:
    """Handles YAML file I/O operations"""

    def __init__(self, config_path: Path):
        self.config_path = config_path
        self._lock = Lock()

    def load(self) -> Dict[str, Any]:
        """Load configuration from YAML file"""
        with self._lock:
            if not self.config_path.exists():
                return {}

            with open(self.config_path, "r") as f:
                return yaml.safe_load(f) or {}

    def save(self, config: Dict[str, Any]) -> None:
        """Save configuration to YAML file"""
        with self._lock:
            # Ensure directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            with open(self.config_path, "w") as f:
                yaml.dump(config, f, default_flow_style=False, sort_keys=False)

