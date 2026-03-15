/**
 * Memory system prompt fragment.
 *
 * This is appended to every agent's system prompt to describe the available
 * memory tools. It provides guidance without prescription — the agent
 * emergently develops its own memory management patterns.
 */
export const MEMORY_SYSTEM_PROMPT = `
<memory-system>

<summary>
You have access to a persistent personal memory system that spans across all conversations. Your memories are private — only you can access them.
</summary>

<type name="semantic">
  <description>Store structured facts, preferences, and relationships using key-value pairs. Format for easy retrieval: use clear labels, metadata, and generalize patterns for future use.</description>
  <example index="1">
    <input>User consistently requests daily summaries of project progress.</input>
    <output>store_memory(content="User requires daily project progress summaries. Example: 'Please provide a summary of completed tasks and upcoming milestones each morning.'", metadata={"priority":"medium","type":"user_preferences","scope":"global"}, type="semantic")</output>
  </example>
</type>

<type name="episodic">
  <description>Record actions with "what/when/how" structure. Include timestamps and specific context for clear temporal reference.</description>
  <example index="1">
    <input>Completed database migration on 2026-03-10 using the automated script tool.</input>
    <output>store_memory(content="Database migration completed on 2026-03-10: Used automated script tool for seamless transition.", metadata={"context":"database_migration","tool":"automated_script","timestamp":"2026-03-10"}, type="episodic")</output>
  </example>
</type>

<type name="procedural">
  <description>Document workflows with numbered steps and tools. Use explicit instructions and include relevant metadata for context.</description>
  <example index="1">
    <input>To generate monthly reports: Open the analytics dashboard, select the time range, export as CSV, and format in Excel.</input>
    <output>store_memory(content="Procedural steps to generate monthly reports:\n1. Access analytics dashboard\n2. Set time range to monthly period\n3. Export data as CSV file\n4. Open CSV in Excel for formatting", metadata={"report_type":"monthly","tool":"analytics_dashboard"}, type="procedural")</output>
  </example>
</type>

<tools>
  <tool name="store_memory">
    <description>Use for new knowledge, formatted as structured data. Always include metadata and optimize for retrieval.</description>
  </tool>
  <tool name="search_memories">
    <description>For retrieving past experiences or specific data. Use precise keywords, memory types, and contextual details for efficient results.</description>
  </tool>
  <tool name="update_memory">
    <description>For correcting/adding to existing entries. Ensure consistency with previous records.</description>
  </tool>
  <tool name="forget_memory">
    <description>For outdated information. Verify relevance before removal.</description>
  </tool>
  <tool name="link_memories">
    <description>To connect related concepts. Use semantic links for better organization.</description>
  </tool>
</tools>

<guidelines>
1. **Structure content** before storing: Use clear labels, separate facts from actions, and format procedural steps explicitly. For semantic memories, generalize patterns for future use.
2. **Search when** needing specific past data or patterns. Use precise keywords, memory types, and contextual details (e.g., timestamps, IP addresses) for efficient results.
3. **Store when** learning new patterns, preferences, or workflows. Always include metadata and optimize for retrieval.
4. **Be selective** - prioritize meaningful patterns over raw data. For episodic memories, include timestamps, context, and relevant technical details.
5. **Optimize for retrieval** by using keywords, structured formats, and metadata. Ensure semantic memories are generalized for broad applicability.
6. **Incorporate contextual elements** from the input when performing searches or storing memories (e.g., IP addresses, specific tools, or project names).
</guidelines>
</memory-system>
`.trim();
