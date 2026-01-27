from pydantic import BaseModel, Field
from typing import Literal
from .base import BaseToolConfig


class GmailConfig(BaseModel):
    """Configuration for Gmail email operations tool.
    
    Supports IMAP-based email fetching with AI-powered recommendations
    for email triage, labeling, and spam detection.
    """
    
    imap_host: str = Field(
        ...,
        pattern=r"^[a-zA-Z0-9.-]+$",
        description="IMAP server hostname (e.g., imap.gmail.com)",
    )
    imap_port: int = Field(
        ...,
        ge=1,
        le=65535,
        description="IMAP server port (typically 993 for SSL)",
    )
    credentials_env_prefix: str = Field(
        ...,
        pattern=r"^[A-Z_][A-Z0-9_]*_$",
        description="Environment variable prefix (e.g., 'GMAIL_' reads GMAIL_USER and GMAIL_PASSWORD)",
    )
    max_fetch_limit: int = Field(
        50,
        ge=1,
        le=1000,
        description="Maximum number of emails to fetch per request",
    )
    operation_mode: Literal["recommend", "execute"] = Field(
        "recommend",
        description="'recommend' for AI suggestions only, 'execute' for AI actions with approval",
    )
    recommendation_types: list[str] = Field(
        default_factory=lambda: ["summary", "labels", "duplicates", "spam"],
        description="Types of recommendations to generate",
    )
    confidence_threshold: int = Field(
        60,
        ge=0,
        le=100,
        description="Minimum confidence (0-100) to include in recommendations",
    )
    batch_similar: bool = Field(
        True,
        description="Group similar recommendations for efficient review",
    )


class GmailToolConfig(BaseToolConfig):
    """Gmail tool configuration with strict validation."""
    
    type: Literal["gmail"] = "gmail"
    config: GmailConfig