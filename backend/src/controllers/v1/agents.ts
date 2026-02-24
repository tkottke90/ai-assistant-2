import { Router } from 'express';
import AgentDao from '../../lib/dao/agent.dao.js';
import { AgentProperties, CreateAgentDTO } from '../../lib/models/agent.js';
import { ZodBodyValidator, ZodIdValidator, ZodQueryValidator } from '../../middleware/zod.middleware.js';
import { PaginationQuerySchemaBase, PaginationQuery } from '../../lib/types/pagination.js';

export const router = Router();

// Create a new agent
router.post('/',
  ZodBodyValidator(AgentProperties),
  async (req, res) => {
  try {
    const agentData: CreateAgentDTO = req.body;
    const agent = await AgentDao.createAgent(agentData);
    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// List all agents (latest version only) with pagination
router.get('/',
  ZodQueryValidator(PaginationQuerySchemaBase),
  async (req, res) => {
  try {
    const { page, take } = res.locals.query as any;
    const paginationQuery: PaginationQuery = {
      page,
      take,
      skip: (page - 1) * take
    };
    const paginatedAgents = await AgentDao.listAgents(paginationQuery);
    res.json(paginatedAgents);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Get a specific agent by ID (latest version)
router.get('/:id',
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

    const agent = await AgentDao.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// Update an agent (creates new version)
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
    console.error('Error updating agent:', error);
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

export default router;