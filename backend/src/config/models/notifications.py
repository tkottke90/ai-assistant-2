from typing import Optional, Literal, Dict
from pydantic import BaseModel, Field, HttpUrl
from .base import BaseConfig


class BaseNotificationConfig(BaseConfig):
    """Base class for notification configurations"""

    enabled: bool = Field(default=False, description="Enable or disable this notification method")


class InAppNotificationConfig(BaseNotificationConfig):
    """Configuration for in-app notifications"""

    max_unread: int = Field(default=50, ge=1)
    auto_dismiss_after_days: int = Field(default=7, ge=0)

    enabled: bool = Field(default=True, description="Enable or disable in-app notifications")


class DevicePushConfig(BaseNotificationConfig):
    """Configuration for device push notifications"""

    vapid_public_key: str = Field(default="")
    vapid_private_key_env: str = Field(default="VAPID_PRIVATE_KEY")


class WebhookPayloadProperty(BaseModel):
    """Model for webhook payload configuration"""

    default: Optional[str] = Field(default=None, description="Default value for the property")

    description: str = Field(default="", description="Description of the property")

    required: bool = Field(default=False, description="Whether this property is required")

    options: Optional[list[str]] = Field(
        default=None, description="Allowed options for the property"
    )


class ExternalWebhookConfig(BaseNotificationConfig):
    """Configuration for external webhook notifications"""

    base_url: HttpUrl = Field(default="", description="Webhook URL to send notifications to")

    method: Literal["POST", "GET", "PUT", "DELETE"] = Field(
        default="POST", description="HTTP method to use for the webhook"
    )

    headers: Dict[str, str] = Field(
        default_factory=dict, description="Additional headers to include in the webhook request"
    )

    payload_type: Literal["json", "form", "text"] = Field(
        default="json", description="Type of payload to send in the webhook"
    )

    payload_template: Dict[str, WebhookPayloadProperty] = Field(
        default_factory=dict,
        description="Template for the webhook payload properties",
    )


class NotificationsConfig(BaseConfig):
    """Configuration for all notification methods"""

    in_app: InAppNotificationConfig = Field(
        default_factory=InAppNotificationConfig,
        description="Configuration for in-app notifications",
    )

    device_push: Optional[DevicePushConfig] = Field(
        default=None,
        description="Configuration for device push notifications",
    )

    external_webhook: Optional[ExternalWebhookConfig] = Field(
        default=None,
        description="Configuration for external webhook notifications",
    )
