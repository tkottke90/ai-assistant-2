/**
 * Memory System Evaluation Framework
 *
 * Three-level evaluation for the agent memory system:
 * - Level 1: Tool correctness (DAO operations, scoping, CRUD)
 * - Level 2: Search quality (FTS5 relevance, ranking, filtering)
 * - Level 3: Trigger consistency (FTS sync via database triggers)
 *
 * Run: DATABASE_URL='file:../config/data/test.db' npx tsx src/lib/eval/memory-eval.ts
 *
 * Note: Level 3 (Agent behavior / AI-judged) requires a running LLM
 * and is designed to be added as the system matures.
 */

import { prisma } from '../database.js';
import MemoryDao from '../dao/memory.dao.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// Level 1: Tool Correctness
// ────────────────────────────────────────────────────────────────────

async function level1_toolCorrectness() {
  console.log('\n═══ Level 1: Tool Correctness ═══\n');

  const AGENT_A = 9901;
  const AGENT_B = 9902;

  // Cleanup from previous runs
  await prisma.node.deleteMany({
    where: {
      type: { startsWith: 'memory:' },
      properties: { path: '$.agent_id', equals: AGENT_A },
    },
  });
  await prisma.node.deleteMany({
    where: {
      type: { startsWith: 'memory:' },
      properties: { path: '$.agent_id', equals: AGENT_B },
    },
  });

  await runTest('Store and recall a semantic memory', async () => {
    const memory = await MemoryDao.createMemory(
      AGENT_A,
      'semantic',
      'The user prefers TypeScript over JavaScript'
    );
    assert(memory.node_id > 0, 'Memory should have an ID');
    assert(memory.type === 'memory:semantic', `Type should be memory:semantic, got ${memory.type}`);

    const recalled = await MemoryDao.getMemory(memory.node_id, AGENT_A);
    assert(recalled !== null, 'Should be able to recall the memory');
    assert(
      recalled!.properties.content === 'The user prefers TypeScript over JavaScript',
      'Content should match'
    );
  });

  await runTest('Store episodic and procedural memories', async () => {
    const episodic = await MemoryDao.createMemory(
      AGENT_A,
      'episodic',
      'Deployed the app to production, it took 5 minutes'
    );
    assert(episodic.type === 'memory:episodic', 'Type should be memory:episodic');

    const procedural = await MemoryDao.createMemory(
      AGENT_A,
      'procedural',
      'To deploy: run npm build, then scp dist to server, then pm2 restart'
    );
    assert(procedural.type === 'memory:procedural', 'Type should be memory:procedural');
  });

  await runTest('Store memory with metadata', async () => {
    const memory = await MemoryDao.createMemory(
      AGENT_A,
      'semantic',
      'Project uses PostgreSQL 15',
      { confidence: 0.95, source: 'user_stated' }
    );

    const recalled = await MemoryDao.getMemory(memory.node_id, AGENT_A);
    assert(recalled !== null, 'Should recall memory with metadata');
    assert(
      (recalled!.properties as any).confidence === 0.95,
      'Metadata should be preserved'
    );
    assert(
      (recalled!.properties as any).source === 'user_stated',
      'Metadata source should be preserved'
    );
  });

  await runTest('Update a memory', async () => {
    const memory = await MemoryDao.createMemory(
      AGENT_A,
      'semantic',
      'Server runs on port 3000'
    );

    const updated = await MemoryDao.updateMemory(
      memory.node_id,
      AGENT_A,
      'Server runs on port 8080',
      { reason: 'port changed in config' }
    );
    assert(updated !== null, 'Should return updated memory');
    assert(updated!.properties.content === 'Server runs on port 8080', 'Content should be updated');
    assert(
      (updated!.properties as any).reason === 'port changed in config',
      'New metadata should be present'
    );
  });

  await runTest('Delete a memory', async () => {
    const memory = await MemoryDao.createMemory(
      AGENT_A,
      'semantic',
      'Temporary information to delete'
    );

    const deleted = await MemoryDao.deleteMemory(memory.node_id, AGENT_A);
    assert(deleted === true, 'Should return true on successful delete');

    const recalled = await MemoryDao.getMemory(memory.node_id, AGENT_A);
    assert(recalled === null, 'Should not find deleted memory');
  });

  await runTest('Agent scoping: agent A cannot see agent B memories', async () => {
    const memoryB = await MemoryDao.createMemory(
      AGENT_B,
      'semantic',
      'Secret information for agent B only'
    );

    const recalledByA = await MemoryDao.getMemory(memoryB.node_id, AGENT_A);
    assert(recalledByA === null, 'Agent A should NOT be able to recall agent B memory');

    const recalledByB = await MemoryDao.getMemory(memoryB.node_id, AGENT_B);
    assert(recalledByB !== null, 'Agent B SHOULD be able to recall its own memory');
  });

  await runTest('Agent scoping: agent A cannot update agent B memories', async () => {
    const memoryB = await MemoryDao.createMemory(
      AGENT_B,
      'semantic',
      'Agent B data that A should not touch'
    );

    const updated = await MemoryDao.updateMemory(memoryB.node_id, AGENT_A, 'Hacked!');
    assert(updated === null, 'Agent A should NOT be able to update agent B memory');
  });

  await runTest('Agent scoping: agent A cannot delete agent B memories', async () => {
    const memoryB = await MemoryDao.createMemory(
      AGENT_B,
      'semantic',
      'Agent B data that A should not delete'
    );

    const deleted = await MemoryDao.deleteMemory(memoryB.node_id, AGENT_A);
    assert(deleted === false, 'Agent A should NOT be able to delete agent B memory');

    const stillExists = await MemoryDao.getMemory(memoryB.node_id, AGENT_B);
    assert(stillExists !== null, 'Memory should still exist');
  });

  await runTest('Link two memories and retrieve related', async () => {
    const fact = await MemoryDao.createMemory(
      AGENT_A,
      'semantic',
      'The application uses Redis for caching'
    );
    const procedure = await MemoryDao.createMemory(
      AGENT_A,
      'procedural',
      'To clear cache: redis-cli FLUSHALL'
    );

    const linked = await MemoryDao.linkMemories(
      AGENT_A,
      fact.node_id,
      procedure.node_id,
      'relates_to'
    );
    assert(linked === true, 'Should successfully link memories');

    const related = await MemoryDao.getLinkedMemories(fact.node_id, AGENT_A);
    assert(related.length >= 1, 'Should find at least one related memory');
    assert(
      related.some((r) => r.node_id === procedure.node_id),
      'Related memories should include the linked procedure'
    );
  });

  await runTest('Cannot link memories across agents', async () => {
    const memoryA = await MemoryDao.createMemory(AGENT_A, 'semantic', 'Agent A memory');
    const memoryB = await MemoryDao.createMemory(AGENT_B, 'semantic', 'Agent B memory');

    const linked = await MemoryDao.linkMemories(
      AGENT_A,
      memoryA.node_id,
      memoryB.node_id,
      'relates_to'
    );
    assert(linked === false, 'Should NOT be able to link memories across agents');
  });

  await runTest('List memories with type filter', async () => {
    const allMemories = await MemoryDao.listMemories(AGENT_A);
    assert(allMemories.data.length > 0, 'Should have some memories');

    const semanticOnly = await MemoryDao.listMemories(AGENT_A, 'semantic');
    assert(
      semanticOnly.data.every((m) => m.type === 'memory:semantic'),
      'All listed memories should be semantic'
    );

    const proceduralOnly = await MemoryDao.listMemories(AGENT_A, 'procedural');
    assert(
      proceduralOnly.data.every((m) => m.type === 'memory:procedural'),
      'All listed memories should be procedural'
    );
  });
}

// ────────────────────────────────────────────────────────────────────
// Level 2: Search Quality
// ────────────────────────────────────────────────────────────────────

async function level2_searchQuality() {
  console.log('\n═══ Level 2: Search Quality ═══\n');

  const AGENT_SEARCH = 9903;

  // Cleanup
  await prisma.node.deleteMany({
    where: {
      type: { startsWith: 'memory:' },
      properties: { path: '$.agent_id', equals: AGENT_SEARCH },
    },
  });

  // Seed memories for search tests
  await MemoryDao.createMemory(
    AGENT_SEARCH,
    'semantic',
    'The user prefers dark mode and concise responses'
  );
  await MemoryDao.createMemory(
    AGENT_SEARCH,
    'semantic',
    'The project uses TypeScript with Prisma ORM and SQLite'
  );
  await MemoryDao.createMemory(
    AGENT_SEARCH,
    'episodic',
    'Deployed the application to AWS EC2 instance successfully'
  );
  await MemoryDao.createMemory(
    AGENT_SEARCH,
    'procedural',
    'To deploy: build with npm run build, copy dist folder, restart pm2 process'
  );
  await MemoryDao.createMemory(
    AGENT_SEARCH,
    'semantic',
    'Database connection string uses PostgreSQL on port 5432'
  );

  await runTest('Search finds relevant results', async () => {
    const results = await MemoryDao.searchMemories(AGENT_SEARCH, 'TypeScript Prisma');
    assert(results.length > 0, 'Should find results for "TypeScript Prisma"');
    assert(
      results.some((r) => r.properties.content.includes('TypeScript')),
      'Results should contain TypeScript-related memory'
    );
  });

  await runTest('Search with type filter', async () => {
    const results = await MemoryDao.searchMemories(AGENT_SEARCH, 'deploy', 'procedural');
    assert(results.length > 0, 'Should find procedural deployment memories');
    assert(
      results.every((r) => r.type === 'memory:procedural'),
      'All results should be procedural type'
    );
  });

  await runTest('Search respects agent scoping', async () => {
    const results = await MemoryDao.searchMemories(9999, 'TypeScript');
    assert(results.length === 0, 'Agent 9999 should find no memories');
  });

  await runTest('Search handles empty query gracefully', async () => {
    const results = await MemoryDao.searchMemories(AGENT_SEARCH, '');
    assert(results.length === 0, 'Empty query should return no results');
  });

  await runTest('Search handles special characters', async () => {
    const results = await MemoryDao.searchMemories(AGENT_SEARCH, 'port:5432 AND OR NOT');
    // Should not throw FTS5 syntax error
    assert(Array.isArray(results), 'Should return array (possibly empty) without errors');
  });

  await runTest('Search results are ranked (lower rank = better)', async () => {
    const results = await MemoryDao.searchMemories(AGENT_SEARCH, 'dark mode responses');
    if (results.length >= 2) {
      assert(
        results[0].rank! <= results[1].rank!,
        'First result should have better (lower) rank than second'
      );
    }
  });

  await runTest('Search with limit', async () => {
    const results = await MemoryDao.searchMemories(AGENT_SEARCH, 'the', undefined, 2);
    assert(results.length <= 2, 'Should respect limit parameter');
  });
}

// ────────────────────────────────────────────────────────────────────
// Level 3: Trigger Consistency
// ────────────────────────────────────────────────────────────────────

async function level3_triggerConsistency() {
  console.log('\n═══ Level 3: Trigger Consistency ═══\n');

  const AGENT_TRIGGER = 9904;

  // Cleanup
  await prisma.node.deleteMany({
    where: {
      type: { startsWith: 'memory:' },
      properties: { path: '$.agent_id', equals: AGENT_TRIGGER },
    },
  });

  await runTest('Non-memory Node does NOT create FTS entry', async () => {
    const uniquePhrase = 'xyznonmemorycheck789';
    const node = await prisma.node.create({
      data: {
        type: 'chat_message',
        properties: { agent_id: AGENT_TRIGGER, content: `This is a chat message ${uniquePhrase}` },
      },
    });

    // Contentless FTS5: must use MATCH to check for entries
    const ftsResults = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${uniquePhrase}"`
    );

    assert(
      ftsResults.length === 0,
      'FTS should have NO entry for non-memory nodes'
    );

    // Cleanup
    await prisma.node.delete({ where: { node_id: node.node_id } });
  });

  await runTest('Memory Node INSERT creates FTS entry', async () => {
    const uniquePhrase = 'xyzinsertftstriggertestunique123';
    const memory = await MemoryDao.createMemory(
      AGENT_TRIGGER,
      'semantic',
      `Trigger test: ${uniquePhrase} insert creates FTS entry`
    );

    // Use MATCH to verify FTS entry was created by the trigger
    const ftsResults = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${uniquePhrase}"`
    );

    assert(ftsResults.length === 1, 'Should have exactly one FTS entry');
    assert(
      Number(ftsResults[0].rowid) === memory.node_id,
      'FTS rowid should match node_id'
    );
  });

  await runTest('Memory Node UPDATE syncs FTS entry', async () => {
    const originalPhrase = 'xyzorigbeforeupdate456';
    const updatedPhrase = 'xyzupdatedafterchange789';

    const memory = await MemoryDao.createMemory(
      AGENT_TRIGGER,
      'semantic',
      `Original content ${originalPhrase}`
    );

    await MemoryDao.updateMemory(memory.node_id, AGENT_TRIGGER, `Updated content ${updatedPhrase}`);

    // Old content should no longer be in FTS
    const oldResults = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${originalPhrase}"`
    );
    assert(oldResults.length === 0, 'Old content should be removed from FTS after update');

    // New content should be in FTS
    const newResults = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${updatedPhrase}"`
    );
    assert(newResults.length === 1, 'Updated content should be in FTS');
    assert(
      Number(newResults[0].rowid) === memory.node_id,
      'FTS rowid should still match node_id'
    );
  });

  await runTest('Memory Node DELETE removes FTS entry', async () => {
    const uniquePhrase = 'xyzdeletetriggercheck321';
    const memory = await MemoryDao.createMemory(
      AGENT_TRIGGER,
      'semantic',
      `This memory will be deleted ${uniquePhrase}`
    );

    // Verify FTS entry exists first
    const before = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${uniquePhrase}"`
    );
    assert(before.length === 1, 'FTS entry should exist before delete');

    await MemoryDao.deleteMemory(memory.node_id, AGENT_TRIGGER);

    const after = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${uniquePhrase}"`
    );
    assert(after.length === 0, 'FTS entry should be removed after delete');
  });

  await runTest('FTS count matches Node count for memory types', async () => {
    // Create a few memories with a unique marker so we can count them
    const uniqueMarker = 'xyzcountmarker555';
    await MemoryDao.createMemory(AGENT_TRIGGER, 'semantic', `Count test one ${uniqueMarker}`);
    await MemoryDao.createMemory(AGENT_TRIGGER, 'episodic', `Count test two ${uniqueMarker}`);
    await MemoryDao.createMemory(AGENT_TRIGGER, 'procedural', `Count test three ${uniqueMarker}`);

    const nodeCount = 3;
    const ftsResults = await prisma.$queryRawUnsafe<any[]>(
      `SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?`,
      `"${uniqueMarker}"`
    );

    assert(
      ftsResults.length === nodeCount,
      `FTS count (${ftsResults.length}) should match Node count (${nodeCount})`
    );
  });
}

// ────────────────────────────────────────────────────────────────────
// Main runner
// ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Agent Memory System Evaluation       ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await level1_toolCorrectness();
    await level2_searchQuality();
    await level3_triggerConsistency();
  } catch (err: any) {
    console.error('\nFatal error during evaluation:', err.message);
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('\n═══════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  ✗ ${r.name}: ${r.error}`));
  }

  console.log('═══════════════════════════════════\n');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
