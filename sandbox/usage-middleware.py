"""
Demonstrates combining usage tracking with agent middleware in LangChain. This
pattern should allow us to monitor token usage and costs while processing
agent interactions.

This test is a proof of how we could leverage LangChain to measure token usage
and what the implementation might look like.  Specifically if the callback's counter
resets for every invocation or if it is cumulative across invocations.

Results:

- Each invocation correctly tracks token usage independently.
- The UsageMetadataCallbackHandler provides detailed token usage data per model
- Custom state middleware is used to setup the agent state schema.
- The Callback handler can be reused across multiple invocations without state leakage.
- The callback can be a property of the agent
- The middleware will need to have access to the callback to read usage data
"""

from typing import Any
from langchain_ollama import ChatOllama
from langchain.agents import create_agent
from langchain_core.callbacks import UsageMetadataCallbackHandler
from langchain_core.messages import HumanMessage
from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.messages import AIMessage, AnyMessage
from langgraph.runtime import Runtime
import json

llm = ChatOllama(model="mistral:7b")

# See: ./usage-callback.py
counter = UsageMetadataCallbackHandler()

# Option 1: Explicit TypedDict (Recommended)
class CustomState(AgentState):
    invocationId: str

class CustomStateMiddleware(AgentMiddleware):
    state_schema = CustomState
    tools = []

    def before_model(self, state: CustomState, runtime) -> dict[str, Any] | None:
        ...


# Setup the middleware as a class so we can pass in the
# max token limit
class MessageLimitMiddleware(AgentMiddleware):
    def __init__(self, max_tokens: int = 10_000):
        super().__init__()
        self.max_tokens = max_tokens

    def before_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        invocation = state.get("invocationId", "unknown-invocation")
        print(f'=== Invocation ID: {invocation} ===')
        
        print('\n === Before Model === \n')
        print(f'Token Count: {counter.usage_metadata.get("total_tokens", 0)}')
        
        return None

    def after_model(self, state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
        print('\n === After Model === \n')
        
        print(f"Model returned: {state['messages'][-1].content[:50]}...")

        print('\n ======================== \n')

        print(
            json.dumps(counter.usage_metadata, indent=2)
        )

        return None

# == Setup Agent ==
agent = create_agent(
  model=llm,
  system_prompt="You're a helpful assistant that provides concise weather information.",
  middleware=[
    CustomStateMiddleware(),
    MessageLimitMiddleware(max_tokens=5000)
  ]
)

# Invoke the agent with usage tracking

input1: CustomState = CustomState(
    invocationId="test-invocation-001",
    messages=[
        HumanMessage(content="What's the weather like today?")
    ]
)

response = agent.invoke(
  input1,
  config={ "callbacks": [counter] }
)

"""
Example Output:

=== Invocation ID: test-invocation-001 ===

 === Before Model === 

Token Count: 0

 === After Model === 

Model returned:  In order to provide you with accurate weather inf...

 ======================== 

{
  "mistral:7b": {
    "input_tokens": 27,
    "output_tokens": 72,
    "total_tokens": 99
  }
}
"""

# Invoke the agent a second time.  This was to test if
# the counter callback would reset between invocations.
input2: CustomState = CustomState(
    invocationId="test-invocation-002",
    messages=[
        HumanMessage(content="Give me a random forecast for a seaside city?")
    ]
)

response = agent.invoke(
  { 
    "invocationId" : "test-invocation-002",
    "messages": [
      HumanMessage(content="What's the weather like today?")
    ]
  },
  config={ "callbacks": [counter] }
)

"""
Example Output:

=== Invocation ID: test-invocation-002 ===

 === Before Model === 

Token Count: 0

 === After Model === 

Model returned:  Today, the weather is sunny with a high of 75°F (...

 ======================== 

{
  "mistral:7b": {
    "total_tokens": 152,
    "input_tokens": 54,
    "output_tokens": 98
  }
}
"""
