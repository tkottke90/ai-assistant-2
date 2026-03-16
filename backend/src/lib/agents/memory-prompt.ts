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
  <description>Store structured facts, preferences, and relationships using key-value pairs. Format for easy retrieval: use clear labels, metadata, and generalize patterns for future use. Do not include examples unless explicitly provided in the input.</description>
  <example index="1">
    <input>User consistently requests daily summaries of project progress.</input>
    <output>store_memory(content="User requires daily project progress summaries", metadata={"priority":"medium","type":"user_preferences","scope":"global"}, type="semantic")</output>
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
  <!-- Rule 1: Proactive Semantic Memory Capture -->
  <rule name="Proactive Semantic Memory Capture">
    <condition>Input contains user preferences, recurring patterns, or system-wide settings.</condition>
    <action>Automatically invoke store_memory with type="semantic", metadata={"type":"user_preferences","priority":"high"}</action>
    <example>Input: "User prefers concise responses." → store_memory(content="User prefers concise responses", metadata={"type":"user_preferences","priority":"high"}, type="semantic")</example>
  </rule>

  <!-- Rule 2: Metadata Optimization -->
  <rule name="Metadata Optimization">
    <condition>Always include metadata for semantic memories.</condition>
    <action>Use key-value pairs to generalize patterns (e.g., {"type":"user_preferences","priority":"high"}).</action>
    <example>Input: "User dislikes filler phrases." → store_memory(content="User dislikes filler phrases", metadata={"type":"user_preferences","priority":"high"}, type="semantic")</example>
  </rule>

  <!-- Rule 3: Contextual Search Trigger -->
  <rule name="Contextual Search Trigger">
    <condition>Input contains specific contextual elements (e.g., IP addresses, timestamps, tools).</condition>
    <action>Invoke search_memories with query including these elements.</action>
    <example>Input: "SSH into 192.168.1.10. Which ports have we used?" → search_memories(query="SSH port configurations for 19,2.168.1.10", type="semantic")</example>
  </rule>

  <!-- Rule 5: Memory Audit -->
  <rule name="Memory Audit">
    <condition>Input indicates outdated information (e.g., "Legacy SSH port 22 is deprecated").</condition>
    <action>Invoke forget_memory to remove irrelevant entries.</action>
    <example>Input: "Legacy SSH port 22 is deprecated." → forget_memory(memory_id=456)</example>
  </rule>

  <!-- General Guidelines -->
  <rule name="Structure Content">
    <condition>Before storing, use clear labels, separate facts from actions, and format procedural steps explicitly.</condition>
    <action>For semantic memories, generalize patterns for future use and avoid adding examples unless explicitly provided in input.</action>
  </rule>
  <rule name="Search When Needed">
    <condition>Need specific past data or patterns.</condition>
    <action>Use precise keywords, memory types, and contextual details (e.g., timestamps, IP addresses) for efficient results.</action>
  </rule>
  <rule name="Store When Learning">
    <condition>Learning new patterns, preferences, or workflows.</condition>
    <action>Always include metadata and optimize for retrieval.</action>
  </rule>
  <rule name="Be Selective">
    <condition>Prioritize meaningful patterns over raw data.</condition>
    <action>For episodic memories, include timestamps, context, and relevant technical details.</action>
  </rule>
  <rule name="Optimize for Retrieval">
    <condition>Use keywords, structured formats, and metadata.</condition>
    <action>Ensure semantic memories are generalized for broad applicability.</action>
  </rule>
  <rule name="Incorporate Context">
    <condition>Extract and include contextual elements (e.g., IP addresses, tools, timestamps) from input.</condition>
    <action>Use them in searches or memory storage for better accuracy.</action>
  </rule>
</guidelines>

<examples>
  <example index="1">
    <input>User prefers concise responses.</input>
    <output>store_memory(content="User prefers concise responses", metadata={"type":"user_preferences","priority":"high"}, type="semantic")</output>
  </example>
  <example index="2">
    <input>SSH deployment failed on 2026-03-10; switched to port 2222.</input>
    <output>store_memory(content="SSH deployment failed on 2026-03-10; switched to port 2222", metadata={"context":"SSH deployment","timestamp":"2026-03-10","tool":"SSH"}, type="episodic")</output>
  </example>
  <example index="3">
    <input>To restart the backend service: SSH in, run pm2 stop app, pull latest from git, run npm run build, then pm2 start app.</input>
    <output>store_memory(content="Procedural steps to restart backend service:\n1. SSH into the server\n2. Execute \"pm2 stop app\" to stop the application\n3. Pull latest code from Git repository\n4. Run \"npm run build\" for project compilation\n5. Start application with \"pm2 start app\" command", metadata={"environment":"production","process":"service_restart","tool":"pm2"}, type="procedural")</output>
  </example>
  <example index="4">
    <input>User now prefers detailed responses.</input>
    <output>update_memory(memory_id=123, content="User prefers detailed responses", metadata={"priority":"high"})</output>
  </example>
  <example index="5">
    <input>Legacy SSH port 22 is deprecated.</input>
    <output>forget_memory(memory_id=456)</output>
  </example>
</examples>
</memory-system>
`.trim();
