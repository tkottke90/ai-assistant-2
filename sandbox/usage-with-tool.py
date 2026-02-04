"""
sandbox.usage-with-tool

This example demonstrates how to use the ContextWindowManager middleware
to manage context windows and track usage metadata during agent invocations
including with tool usage.

"""
from typing import Any, Annotated
from langchain_ollama import ChatOllama
from langchain.agents import create_agent
from langchain_core.callbacks import UsageMetadataCallbackHandler
from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.messages import AIMessage, AnyMessage, SystemMessage, HumanMessage
from langchain.tools import tool
from langgraph.runtime import Runtime
import operator

import json

llm = ChatOllama(model="mistral:7b")

# See: ./usage-callback.py
counter = UsageMetadataCallbackHandler()

@tool(
  description="Get the current weather for a given location. The location should be in 'City, Country' format.",
  args_schema={ "location": str }
)
def get_weather(location: str) -> str:
    print(f'[Tool: get_weather] Tool invoked with location: {location}')

    if (location.find(",") == -1):
        raise ValueError("Location must be in 'City, Country' format.")

    # Dummy implementation for example purposes
    return f"The weather in {location} is sunny with a high of 75°F."

# Configures the custom state for our middleware
class CustomState(AgentState):
    invocationId: str

    usage: float = 0.0

    modelCalls: Annotated[int, operator.add]
    inputTokens: Annotated[int, operator.add]
    outputTokens: Annotated[int, operator.add]
    totalTokens: Annotated[int, operator.add]

# Configures the custom state for our middleware
class CustomStateMiddleware(AgentMiddleware):
    state_schema = CustomState
    tools = [get_weather]

    def before_model(self, state: CustomState, runtime) -> dict[str, Any] | None:
        ...

# Setup the middleware as a class so we can pass in the
# max token limit
class MessageLimitMiddleware(AgentMiddleware):
    def __init__(self, *, max_tokens: int = 10_000, counter: UsageMetadataCallbackHandler = counter):
        super().__init__()
        self.max_tokens = max_tokens
        self.counter = counter

    def before_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        invocation = state.get("invocationId", "unknown-invocation")
        print(f'[{invocation}] Before Model Middleware Triggered')
        print(f'[{invocation}] Token Count: {counter.usage_metadata.get("total_tokens", 0)}')

        return None

    def after_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        invocation = state.get("invocationId", "unknown-invocation")
        print(f'[{invocation}] After Model Middleware Triggered')
        
        print(f'[{invocation}] Model returned: {state['messages'][-1].content[:50]}...')
        print(f'[{invocation}] {json.dumps(counter.usage_metadata)}')

        usage = self.counter.usage_metadata

        inputTokens = 0
        outputTokens = 0
        totalTokens = 0

        for value in usage.values():
            if "input_tokens" in value:
                inputTokens += value.get("input_tokens", 0)
            
            if "output_tokens" in value:
                outputTokens += value.get("output_tokens", 0)
            
            if "total_tokens" in value:
                totalTokens += value.get("total_tokens", 0)

        return { 
            "modelCalls": 1,
            "inputTokens": inputTokens,
            "outputTokens": outputTokens,
            "totalTokens": totalTokens,
            "usage": totalTokens / self.max_tokens
        }

max_tokens = 5000

# == Setup Agent ==
agent = create_agent(
  model=llm,
  system_prompt="You're a helpful assistant that provides concise weather information.",
  tools=[get_weather],
  middleware=[
    CustomStateMiddleware(),
    MessageLimitMiddleware(max_tokens=max_tokens, counter=counter)
  ]
)

# Invoke the agent with usage tracking
input1: CustomState = CustomState(
    invocationId="test-invocation-001",
    messages=[
        SystemMessage(
            content="""## Role 

You are a helpful assistant that provides concise weather information.

## Instructions

Given a user's request for weather information, use the provided tool to fetch the current weather for the specified location. 
Always respond with a brief summary of the weather conditions.
"""
        ),
        HumanMessage(content="What's the weather like today?")
    ]
)

response = agent.invoke(
  input1,
  config={ "callbacks": [counter] }
)

print(f"Tokens: {response.get('totalTokens', 0)} tokens (max allowed: {response.get('usage', 0):.2%})")
print(f"  Input Tokens: {response.get('inputTokens', 0)} tokens")
print(f"  Output Tokens: {response.get('outputTokens', 0)} tokens")

