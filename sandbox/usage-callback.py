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

from langchain_ollama import ChatOllama
from langchain.agents import create_agent
from langchain_core.callbacks import UsageMetadataCallbackHandler
from langchain_core.messages import HumanMessage
import json

llm = ChatOllama(model="mistral:7b")

# Docs: https://docs.langchain.com/oss/python/langchain/models#token-usage
counter = UsageMetadataCallbackHandler()

agent = create_agent(
  model=llm,
  system_prompt="You're a helpful assistant that provides concise weather information.",
)

response = agent.invoke(
  { 
    "messages": [
      HumanMessage(content="What's the weather like today?")
    ]
  },
  config={ "callbacks": [counter] }
)

print(
  json.dumps(counter.usage_metadata, indent=2)
)