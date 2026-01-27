from typing import List
from typing_extensions import Literal
from pydantic import Field
from .base import BaseConfig
from typing import ClassVar


class ScheduleConfig(BaseConfig):
    requires_restart: ClassVar[bool] = False

    # Automatically load and activate schedules on system startup
    auto_load_on_startup: bool = Field(default=True)

    # Set the default timezone for scheduling tasks
    default_timezone: str = Field(default="UTC")
    
    # Determines how the system should handle tasks that bleed over into another
    # scheduled period.
    #
    # "skip" - Do not start a new task if the previous one is still running.
    # "cancel" - Cancel the previous task and start the new one.
    overlap_policy: Literal["skip", "queue", "cancel"] = Field(default="skip")
    
    ## Alert settings ##

    # How many times should a scheduled task miss its execution before an alert is sent
    default_alert_threshold: int = Field(default=3, ge=1, description="Consecutive misses before alert")

    # Default severity level for alerts
    default_alert_severity: Literal["INFO", "WARNING", "CRITICAL"] = Field(default="WARNING")

    # Default channels through which alerts are sent - See NotificationConfig for available channels
    default_alert_channels: List[str] = Field(default=["in_app", "push", "webhook"], description="Enabled notification channels")

