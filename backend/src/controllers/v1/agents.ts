import { Router, Request } from 'express';
import AgentDao from '../../lib/dao/agent.dao.js';
import MemoryDao from '../../lib/dao/memory.dao.js';
import { AgentProperties, CreateAgentDTO } from '../../lib/models/agent.js';
import { ZodBodyValidator, ZodIdValidator, ZodQueryValidator } from '../../middleware/zod.middleware.js';
import { PaginationQuerySchemaBase, PaginationQuery } from '../../lib/types/pagination.js';
import { BadRequestError, NotFoundError } from '../../lib/errors/http.errors.js';
import { AgentRuntime } from '../../lib/agents/agent-runtime.js';

export const router = Router();

// Create a new agent
router.post('/',
  ZodBodyValidator(AgentProperties),
  async (req, res) => {
  req.logger.info('Loading Agent Manager');
  const agentManager = req.app.agents;
  
  try {
    req.logger.info('Creating new agent');
    
    const agentData: CreateAgentDTO = req.body;
    const agent = await AgentDao.createAgent(agentData);

    req.logger.debug('Agent created successfully', { ...agent });
    req.logger.info('Registering agent with Agent Manager');
    
    const llmEngine = req.app.llm.getClient(agentData.engine);
    agentManager.registerAgent(
      AgentRuntime.fromDatabase(agent, llmEngine)
    );
    
    req.logger.info('Agent registered successfully');

    res.status(201).json(agent);
  } catch (error) {
    req.logger.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// List all agents (latest version only) with pagination
router.get('/',
  ZodQueryValidator(PaginationQuerySchemaBase),
  async (req, res) => {
  const agentManager = req.app.agents;

  const { page, take } = res.locals.query as any;

  const paginationQuery: PaginationQuery = {
    page,
    take,
    skip: (page - 1) * take
  };

  const paginatedAgents = await AgentDao.listAgents(paginationQuery);
  
  res.json({
    data: paginatedAgents.data.map(agent => ({
      ...agent,
      is_active: agentManager.isActive(agent.agent_id)
    })),
    pagination: paginatedAgents.pagination
  });
});

async function getAgentById(req: Request) {
  const agentId = Array.isArray(req.params.id) ?
    parseInt(req.params.id[0], 10) :
    parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    throw new BadRequestError('Invalid agent ID');
  }

  const agent = await AgentDao.getAgent(agentId);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }

  return agent;
}

// List active agents (lightweight)
router.get('/active', async (req, res) => {
  const agentManager = req.app.agents;
  const activeAgents = agentManager.listActiveAgents().map(runtime => ({
    agent_id: runtime.id,
    name: runtime.name,
    description: runtime.description,
  }));

  res.json({ agents: activeAgents });
});

// Get a specific agent by ID (latest version)
router.get('/:id',
  ZodIdValidator('id'),
  async (req, res) => {
    const agent = await getAgentById(req);
    res.json(agent);
  }
);

// Get agent details including memories and tools
router.get('/:id/details',
  ZodIdValidator('id'),
  async (req, res) => {
    const agentManager = req.app.agents;
    const agent = await getAgentById(req);

    const memories = await MemoryDao.listMemories(agent.agent_id);

    const agentRuntime = agentManager.getAgent(agent.agent_id);

    const agentTools = await agentRuntime?.getTools();
    agentTools
      ?.map(tool => tool.getName())
      .reduce((acc, toolName) => {
        acc[toolName] = true;
        return acc;
      }, {} as Record<string, boolean>);

    res.json({
      ...agent,
      is_active: agentManager.isActive(agent.agent_id),
      memories,
      tools: agentTools
      ?.map(tool => tool.getName())
      .reduce((acc, toolName) => {
        acc[toolName] = { allowEdit: false, value: true };
        return acc;
      }, {} as Record<string, { allowEdit: boolean, value: boolean }>)
    });
  }
);

router.post('/:id/start',
  ZodIdValidator(),
  async (req, res) => {
    req.logger.info('Loading Agent Manager');
    const agentManager = req.app.agents;

    const agent = await getAgentById(req);

    if (agentManager.isActive(agent.agent_id)) {
      throw new NotFoundError('Agent not found');
    }

    agentManager.startAgent(agent.agent_id);

    req.logger.info('Agent started successfully');
    res.status(200).json({ message: 'Agent started' });
  }
);

router.post('/:id/stop',
  ZodIdValidator(),
  async (req, res) => {
    req.logger.info('Loading Agent Manager');
    const agentManager = req.app.agents;
    
    const agent = await getAgentById(req);
    
    req.logger.info('Stopping agent', { agent: agent.name });
    agentManager.stopAgent(agent.agent_id);
    
    req.logger.info('Agent stopped successfully');
    res.status(200).json({ message: 'Agent stopped' });
  }
);

// Create a new version of an agent, optionally with modifications
router.post('/:id/version',
  ZodIdValidator('id'),
  ZodBodyValidator(AgentProperties.partial()),
  async (req, res) => {
    const agent = await getAgentById(req);

    try {
      const overrides: Partial<CreateAgentDTO> = req.body;
      const newVersion = await AgentDao.createAgentVersion(agent.agent_id, overrides);
      res.status(201).json(newVersion);
    } catch (error) {
      req.logger.error('Error creating agent version:', error);
      res.status(500).json({ error: 'Failed to create agent version' });
    }
  }
);

// Update an agent
router.put('/:id',
  ZodIdValidator('id'),
  ZodBodyValidator(AgentProperties.partial()),
  async (req, res) => {
  try {
    const agentId = Array.isArray(req.params.id) ?
      parseInt(req.params.id[0], 10) :
      parseInt(req.params.id, 10);
      
    if (isNaN(agentId)) {
      res.status(400).json({ error: 'Invalid agent ID' });
      return;
    }

    const agentData: Partial<CreateAgentDTO> = req.body;
    const updatedAgent = await AgentDao.updateAgent(agentId, agentData);
    res.json(updatedAgent);
  } catch (error) {
    req.logger.error('Error updating agent:', error);
    if (error instanceof Error && error.message === 'Agent not found') {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete an agent (all versions)
router.delete(
  '/:id',
  ZodIdValidator('id'),
  async (req, res) => {
  try {
    const agentId = Array.isArray(req.params.id) ?
      parseInt(req.params.id[0], 10) :
      parseInt(req.params.id, 10);

    if (isNaN(agentId)) {
      res.status(400).json({ error: 'Invalid agent ID' });
      return;
    }

    await AgentDao.deleteAgent(agentId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Delete a specific memory belonging to an agent
router.delete('/:id/memories/:nodeId',
  ZodIdValidator('id'),
  ZodIdValidator('nodeId'),
  async (req, res) => {
    const agent = await getAgentById(req);
    const nodeId = (req.params as any).nodeId as number;

    const deleted = await MemoryDao.deleteMemory(nodeId, agent.agent_id);
    if (!deleted) {
      throw new NotFoundError('Memory not found');
    }

    res.status(204).send();
  }
);

export default router;