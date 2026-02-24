import { ChatOllama } from '@langchain/ollama';
import { Router } from 'express';
import { createAgent } from 'langchain';
import { checkpointer } from '../../lib/database';

export const router = Router();

const llm = new ChatOllama({
  model: 'qwen3:8b',
})

const agent = createAgent({
  model: llm,
  checkpointer
});

router.post('/', async (req, res) => {
  const { message, threadId } = req.body;


  // Set headers for Server-Sent Events streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = agent.stream(
      { messages: [{ role: "user", content: message }] },
      { streamMode: ["updates", "messages", "custom"] }
    );

    for await (const [streamMode, chunk] of await stream) {
      // Send each chunk to the client
      const data = JSON.stringify({ mode: streamMode, chunk });
      res.write(`data: ${data}\n\n`);
      
      // console.log(`${streamMode}: ${JSON.stringify(chunk, null, 2)}`);
    }

    // Signal completion
    res.write('done: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
    res.end();
  }
});


export default router;