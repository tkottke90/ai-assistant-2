from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError
from ...logging import get_logger
from ...dao import agents as AgentsDao
from ...models.agent_model import Agent
from ...models.prompt_base import PromptSection

router = APIRouter(prefix="/agents", tags=["agents"])
logger = get_logger("controllers.agents")


class AgentNodePropertiesRequest(BaseModel):
    """Request model for creating or updating an agent"""
    name: str = Field(..., description="Name of the agent, e.g. 'WeatherBot'")
    description: str = Field(..., description="Description of the agent's purpose and capabilities")
    prompt_template: str = Field(..., description="The prompt template with placeholders for variables")
    variables: Dict[str, Any] = Field(default_factory=dict, description="Key-value pairs for variables used in the prompt template")
    version: float = Field(..., description="Version number for the prompt template")
    sections: Optional[list[PromptSection]] = Field(default_factory=list, description="List of additional prompt sections")


class PaginatedAgentsResponse(BaseModel):
    """Response model for paginated agents list"""
    agents: list[Agent]
    total: int
    limit: int
    offset: int


@router.get("", response_model=PaginatedAgentsResponse)
def list_agents(
    limit: int = Query(default=50, ge=1, le=100, description="Maximum number of agents to return"),
    offset: int = Query(default=0, ge=0, description="Number of agents to skip")
):
    """
    List agents with pagination
    
    Args:
        limit: Maximum number of agents to return (1-100)
        offset: Number of agents to skip
    
    Returns:
        PaginatedAgentsResponse with agents list, total count, limit, and offset
    """
    logger.info(f"Listing agents with limit={limit}, offset={offset}")
    
    try:
        agents, total = AgentsDao.list_agents_paginated(limit, offset)
        return PaginatedAgentsResponse(
            agents=agents,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"Failed to list agents: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list agents")


@router.post("", response_model=Agent, status_code=201)
def create_agent(
    request: AgentNodePropertiesRequest
):
    """
    Create a new agent
    
    Args:
        request: Agent properties
    
    Returns:
        Created Agent
    
    Raises:
        HTTPException 409: Agent with the same name already exists
        HTTPException 422: Invalid agent properties
    """
    logger.info(f"Creating agent: {request.name}")
    
    try:
        from ...models.agent_model import AgentNodeProperties
        props = AgentNodeProperties(**request.model_dump())
        agent = AgentsDao.create_agent(props)
        logger.info(f"Created agent with id={agent.id}")
        return agent
    except ValueError as e:
        if "already exists" in str(e):
            logger.warning(f"Duplicate agent name: {request.name}")
            raise HTTPException(status_code=409, detail=str(e))
        logger.error(f"Failed to create agent: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        logger.error(f"Invalid agent properties: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error creating agent: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create agent")


@router.get("/{agent_id}", response_model=Agent)
def get_agent(
    agent_id: str
):
    """
    Get an agent by ID
    
    Args:
        agent_id: Agent ID
    
    Returns:
        Agent
    
    Raises:
        HTTPException 404: Agent not found
    """
    logger.info(f"Getting agent with id={agent_id}")
    
    try:
        agent = AgentsDao.get_agent(agent_id)
        return agent
    except ValueError as e:
        logger.warning(f"Agent not found: {agent_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get agent: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get agent")


@router.put("/{agent_id}", response_model=Agent)
def update_agent(
    agent_id: str,
    request: AgentNodePropertiesRequest
):
    """
    Update an agent by ID
    
    Args:
        agent_id: Agent ID
        request: Updated agent properties
    
    Returns:
        Updated Agent
    
    Raises:
        HTTPException 404: Agent not found
        HTTPException 409: Agent with the same name already exists
        HTTPException 422: Invalid agent properties
    """
    logger.info(f"Updating agent with id={agent_id}")
    
    try:
        from ...models.agent_model import AgentNodeProperties
        props = AgentNodeProperties(**request.model_dump())
        agent = AgentsDao.update_agent(agent_id, props)
        logger.info(f"Updated agent with id={agent_id}")
        return agent
    except ValueError as e:
        if "already exists" in str(e):
            logger.warning(f"Duplicate agent name: {request.name}")
            raise HTTPException(status_code=409, detail=str(e))
        logger.warning(f"Agent not found: {agent_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        logger.error(f"Invalid agent properties: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error updating agent: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update agent")


@router.delete("/{agent_id}", status_code=204)
def delete_agent(
    agent_id: str
):
    """
    Delete an agent by ID (hard delete)
    
    Args:
        agent_id: Agent ID
    
    Returns:
        None (204 No Content)
    
    Raises:
        HTTPException 404: Agent not found
    """
    logger.info(f"Deleting agent with id={agent_id}")
    
    try:
        # First check if agent exists
        AgentsDao.get_agent(agent_id)
        
        # Delete the agent
        success = AgentsDao.delete_agent(agent_id)
        if not success:
            raise ValueError(f"Failed to delete agent with id '{agent_id}'")
        
        logger.info(f"Deleted agent with id={agent_id}")
        return None
    except ValueError as e:
        logger.warning(f"Agent not found: {agent_id}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete agent: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete agent")
