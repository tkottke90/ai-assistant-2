## App

- Deployment
  - [ ] Support single-file executable
  - [ ] Support Dockerfile deployment
- [ ] Add Prompt Table and make it editable/viewable in the UI
- [ ] Token Consumption
  - [ ] Show consumption by Engine + Model


## API

- Deployment
  - [ ] Support single-file executable
  - [ ] Support Dockerfile deployment
- [ ] Add Prompt Table and make it editable/viewable in the UI
- [ ] [Bug] When an agent is versioned, it creates a new agent record which changes the ID and our current prompt automation does not account for that.
- [X] [Bug] When a new Agent Version is created, the new agent record does not retain the tool access that the previous version had.
- Agents - Tools
  - [ ] [Bug] Agents with elevated (direct) tool access still route through `execute_tool` instead of calling tools directly. The `execute_tool` path is intended for tools that have gone through the discovery and permission flow, not for tools the agent already has permission to use. The name `execute_tool` may itself be misleading, and the permission system as a whole may not be making it clear to agents which tools they can call directly vs. which require the discovery/approval path. This causes intermittent failures where the agent behaves as if it has no direct tool access even when elevated permissions are assigned.

## UI

- [x] Show toast message while starting/stopping agent
- [ ] When an agent is selected in the a thread.  We should keep that agent active even if the user navigates away from the thread and back.  Currently, it resets to "No agent" when you leave the thread.  This causes issues because the user has to remember to re-select the agent every time they leave the thread and come back.
- [X] We have to refresh the page to see which agent sent a message
- [X] We have to refresh the page to detach an actions action from their response
  - Likely due to the stream handling everything that comes back as a message and not paying attention to the content
- [X] We cannot delete/archive threads
- [ ] Copy Code Blocks
- [X] Copy Message
- [ ] Abort Stream
- [ ] Add copy icon for code blocks
- [ ] Chat input
  - [ ] Add dropdown for `@` mentions of other agents
  - [ ] Add dropdown for `/` commands which pull up "skills" (prebuilt prompts) for specific tasks
  - [ ] Add dropdown for `#` tags which allow the user to select a tool to use in the message
    - This should be available in skills as well.

---

## Notes - Next Item

I need to figure out what to do next.  I think I have it narrowed down to:

- Agent working threads
  - A thread where commands are issued and Agents work on them
  - Separate from chat threads
  - Possibly the thread gets a checkpoint when the agent start/finishes a task
- Inter-agent communication
  - Giving the ability for agents to talk to other agents via a tool
  - Possibly Event-Driven
    - How are we managing those messages, do we need persistence?
  - Goes as far as "pulling in" other agents into a non-personal thread
- Agent Tasks
  - Start putting the agents to work
  - Some sort of job queue
    - Maybe a Job Board the agents could pull from?
  - Agent is asked to describe the task in one sentence
    - "I will do this" before the job
    - "I completed this" after the job
- Shared Knowledge
  - While memory is great for identity and goals, keeping general knowledge in memories is inefficient and prone to error
  - This would also allow for sharing by creating a sort of library
  - Agents could FTS the `knowledge:` type nodes
- "Clipboard"
  - Might be good as a case study for how the AI can learn about tools and store it in their memory
  - Creates a scratch pad for the Agent to read/write from
    - Writes are Puts so they need to rewrite the entire document
  - Might also be a good case for evaluations.  I need to look at doing that soon to hopefully alleviate frustrations