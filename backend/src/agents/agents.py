from langchain.agents import create_agent

class AgentFactory:
  @staticmethod
  def create_agent_with_middleware(
    model,
    system_prompt: str,
    middleware: list
  ) -> any:
    
    
    return create_agent(
      model=model,
      system_prompt=system_prompt,
      middleware=middleware
    )