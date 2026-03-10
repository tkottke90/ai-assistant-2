## App

- Deployment
  - [ ] Support single-file executable
  - [ ] Support Dockerfile deployment
- [ ] Add Prompt Table and make it editable/viewable in the UI

## API

- Deployment
  - [ ] Support single-file executable
  - [ ] Support Dockerfile deployment
- [ ] Add Prompt Table and make it editable/viewable in the UI

## UI

- [x] Show toast message while starting/stopping agent
- [ ] When an agent is selected in the a thread.  We should keep that agent active even if the user navigates away from the thread and back.  Currently, it resets to "No agent" when you leave the thread.  This causes issues because the user has to remember to re-select the agent every time they leave the thread and come back.
- [X] We have to refresh the page to see which agent sent a message
- [X] We have to refresh the page to detach an actions action from their response
  - Likely due to the stream handling everything that comes back as a message and not paying attention to the content
- [X] We cannot delete/archive threads
- [ ] Copy Code Blocks
- [ ] Copy Message
- [ ] Abort Stream


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