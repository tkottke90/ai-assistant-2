/**
 * @typedef {Object} ChatMessage
 * @property {'human' | 'ai' | 'system' | 'tool'} type - The sender of the message ('user' or 'agent').
 * @property {string} content - The content of the message.
 * @property {string} id - Unique identifier for the message.
 * @property {Object} [additionalArgs] - Additional arguments for extensibility.
 * @property {Object} [responseMetadata] - Metadata related to the message response.
 */

/**
 * @typedef {ChatMessage} AIChatMessage
 * @property {'ai'} type - The sender of the message is always 'agent' for AI messages.
 * @property {Array} tool_calls - List of tool calls made by the AI.
 * @property {Object} invalid_tool_calls - Details of any invalid tool calls.
 * @property {Object} usage_metadata  - Metadata about the usage of the AI message.
 * @property {number} usage_metadata.input_tokens - Number of tokens in the prompt.
 * @property {number} usage_metadata.output_tokens - Number of tokens in the response.
 * @property {number} usage_metadata.total_tokens - Total number of tokens used.
 */


class ChatInterface extends EventTarget {
  chatTemplate = `
<div data-type="chat-message" class="flex flex-wrap gap-2 max-w-[60%] data-[user]:items-end data-[user]:ml-auto data-[user]:flex-row-reverse group">
  <header class="text-sm font-semibold w-full group-data-[user]:text-right">
    <span data-slot="timestamp"></span>
  </header>

  <p data-slot="avatar" class="w-8 h-8 mb-auto bg-blue-500 text-white rounded-full flex items-center justify-center font-bold"></p>

  <main data-slot="content" class="whitespace-pre-wrap py-6 px-4 bg-zinc-400/50 dark:bg-zinc-700 rounded-lg min-w-[300px] max-w-[140xch] group-data-[thinking]:pulse"></main>

  <footer data-slot="metadata" class="text-sm group-data-[user]:text-right"></footer>
</div>
`;

templateStr = `
<div class="w-full h-full flex flex-col gap-4">
  <header class="flex items-center justify-end p-4">
    <button id="chat-clear">Clear</button>
  </header>
  <main class="flex-grow overflow-y-auto container-blur px-4 sm:px-8 lg:px-16 space-y-4">
  
    <p id="chat-error" class="empty:hidden"></p>
  </main>
  <footer class="py-4">
    <form class="flex px-4 md:mx-auto md:max-w-[150ch] " id="chat-form">
      <input type="hidden" name="threadId" value="">
      <textarea name="message" rows="3" class="w-full p-2 resize-none border-none rounded-l-sm outline-none bg-zinc-300 dark:bg-zinc-500 " placeholder="Type your message..."></textarea>
      <button type="submit" data-theme="primary" class="rounded-l-none rounded-r-sm">Send</button>
    </form>
  </footer>
</div>
`;

  template;

  /**
   * @type {ChatMessage[]}
   */
  chatHistory = [];

  /**
   * Reference to the root chat container element
   * @type {HTMLElement}
   */
  chatElement;

  constructor() {
    super();

    this.template = document.createElement("template");
    this.template.innerHTML = this.templateStr.trim();
  }

  get threadId() {
    if (!this.chatElement) {
      return null;
    }
    const threadIdElem = this.chatElement.querySelector('input[name="threadId"]');
    return threadIdElem?.value || null;
  }

  createChatInterface() {
    // Clone the template content
    const fragment = this.template.content.cloneNode(true);
    
    // Store reference to the root element BEFORE it's appended to DOM
    this.chatElement = fragment.querySelector('.w-full');

    // Setup form submission handler
    const form = this.chatElement.querySelector('#chat-form');
    this.registerChatSubmitHandler(form);

    // Setup the thread input
    const threadIdElem = form.querySelector('input[name="threadId"]');
    void this.setupThreadIdInput(threadIdElem);

    // Setup clear button handler
    this.registerClearButtonHandler(threadIdElem);

    // Return the fragment (which contains our chatElement reference)
    return fragment;
  }

  createNewThread(threadIdElem) {
    fetch('/api/v1/chat/new-thread', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      const newThreadId = data.thread_id;
      threadIdElem.value = newThreadId;

      const updateThreadEvent = new CustomEvent('update-thread-id', { detail: { threadId: newThreadId } });
      threadIdElem.dispatchEvent(updateThreadEvent);
    })
    .catch(error => {
      console.error('Error creating new thread:', error);
    });
  }

  /**
   * Create a user message object
   * @param {string} content
   * @param {string} id
   * @returns {ChatMessage}
   */
  createUserMessage(content) {
    return {
      type: 'human',
      content: content,
      id: 'userPlaceholder',
      additional_kwargs: {
        timestamp: new Date().toISOString()
      },
      response_metadata: {}
    };
  }

  /**
   * Create an AI thinking placeholder message
   * @param {string} id
   * @returns {ChatMessage}
   */
  createThinkingMessage() {
    return {
      type: 'ai',
      content: '...',
      id: 'aiPlaceholder',
      additional_kwargs: {
        timestamp: new Date().toISOString(),
        thinking: true
      },
      response_metadata: {}
    };
  }

  registerClearButtonHandler(threadIdElem) {
    const clearButton = this.chatElement.querySelector('#chat-clear');
    clearButton.addEventListener('click', () => {
      // Get and remove all chat messages
      const messages = this.chatElement.querySelectorAll('[data-type="chat-message"]');
      messages.forEach(msg => msg.remove());

      // Clear the internal chat history
      this.chatHistory = [];

      // Create a new thread
      void this.createNewThread(threadIdElem);
    });
  }

  registerChatSubmitHandler(form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      // Clear any previous errors
      this.chatElement.querySelector('#chat-error').textContent = '';

      const form = event.target;
      const data = new FormData(form);

      const threadId = data.get('threadId');
      const message = data.get('message');

      // Clear the message input
      form.querySelector('textarea[name="message"]').value = '';

      // Create optimistic messages with temporary IDs
      const userMessage = this.createUserMessage(message);
      const thinkingMessage = this.createThinkingMessage();

      // Add optimistic messages to history and render immediately
      this.updateChats(this.chatHistory.concat([userMessage, thinkingMessage]));

      fetch('/api/v1/chat/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          thread_id: threadId,
          message: message
        })
      })
      .then(response => {
        // Processing the Response and handling errors
        if (!response.ok) {
          return response.json().then(err => {
            throw new Error(err.detail || 'Server error');
          });
        }
        return response.json();
      })
      .then(data => {
        // Processing the data and updating the UI

        // Remove temporary messages from DOM
        this.chatElement.querySelector(`[data-chat-id="aiPlaceholder"]`)?.remove();
        this.chatElement.querySelector(`[data-chat-id="userPlaceholder"]`)?.remove();

        // Add real messages from API with server-generated IDs
        if (data.message && Array.isArray(data.message)) {
          console.log('Adding messages to history:', data.message);
          
          this.chatHistory.push(...data.message);

          this.updateChats(this.chatHistory);
        } else {
          console.error('Expected data.message to be an array, got:', typeof data.message, data.message);
        }
      })
      .catch(error => {
        console.error('Error submitting chat message:', error);
        
        // Remove thinking message from DOM
        this.chatElement.querySelector(`[data-chat-id="${tempAiId}"]`)?.remove();
        
        // Remove thinking message from history (keep user message)
        this.chatHistory = this.chatHistory.filter(msg => msg.id !== tempAiId);
        
        // Display error message
        const errorText = error.message || 'Error submitting message. Please try again.';
        this.chatElement.querySelector('#chat-error').textContent = errorText;
      });
    });
  }

  async setupThreadIdInput(threadIdElem) {
    const existingThreadid = window.localStorage.getItem('chat-thread-id');

    threadIdElem.addEventListener('update-thread-id', (e) => {
      const threadId = e.detail.threadId;

      e.target.value = threadId;
      window.localStorage.setItem('chat-thread-id', threadId);
    });

    if (!existingThreadid) {
      await this.createNewThread(threadIdElem);
      window.localStorage.setItem('chat-thread-id', threadIdElem.value);
    } else {
      threadIdElem.value = existingThreadid;
      await fetch(`/api/v1/chat/get-threads/${existingThreadid}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Thread not found');
          }
          return response.json();
        })
        .then(data => {
          console.log('Restored thread:', data);
          // Use chat_history from API response
          this.chatHistory = data.chat_history || [];

          // Render all messages on initial load
          this.updateChats(this.chatHistory);
        })
        .catch(async (error) => {
          console.error('Error restoring thread:', error);
          await this.createNewThread(threadIdElem);
          window.localStorage.setItem('chat-thread-id', threadIdElem.value);
        });
    }
  }

  /**
   * Update chat messages in the UI
   * Only renders new messages that don't already exist
   * @param {ChatMessage[]} messages 
   */
  updateChats(messages) {
    const chatContainer = this.chatElement.querySelector('main');

    const newElements = messages.map((msg) => {
      // Check if message already exists by ID
      const existingMsg = chatContainer.querySelector(`[data-chat-id="${msg.id}"]`);
      
      if (existingMsg) {
        return null; // Skip existing messages to avoid re-renders
      }

      // Create message element from template
      const msgTemplate = document.createElement('template');
      msgTemplate.innerHTML = this.chatTemplate.trim();

      const msgElement = msgTemplate.content.querySelector('div');
      msgElement.setAttribute('data-chat-id', msg.id);

      // Add data-user attribute for human messages
      if (msg.type === 'human') {
        msgElement.setAttribute('data-user', '');
      }

      // Add data-thinking attribute for thinking indicator messages
      if (msg.additional_kwargs?.thinking) {
        msgElement.setAttribute('data-thinking', '');
      }

      // Populate slots
      const contentSlot = msgElement.querySelector('[data-slot="content"]');
      if (contentSlot) {
        contentSlot.innerHTML =
          msg.additional_kwargs?.html ??
          msg.content.replace(/\n/g, '<br>'); // Fallback to plain text with line breaks
      }

      // Show timestamp in header
      const timestampSlot = msgElement.querySelector('[data-slot="timestamp"]');
      if (timestampSlot) {
        const now = new Date();
        const timestamp = new Date(msg.additional_kwargs.timestamp);

        if (now.toDateString() === timestamp.toDateString()) {
          // Same day - show time only
          timestampSlot.textContent = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          // Different day - show date and time
          timestampSlot.textContent = timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }

      // Show sender name in avatar
      const avatarSlot = msgElement.querySelector('[data-slot="avatar"]');
      if (avatarSlot) {
        avatarSlot.textContent = msg.type === 'human' ? 'U' : 'A';
      }

      // Add metadata to footer if present (e.g., token usage)
      const metadataSlot = msgElement.querySelector('[data-slot="metadata"]');
      if (metadataSlot && msg.additional_kwargs?.metadata) {
        const metadata = msg.additional_kwargs.metadata;
        if (metadata.usage) {
          const usage = Object.values(metadata.usage)[0] || {};
          metadataSlot.textContent = `Tokens: ${usage.total_tokens || 0}`;
        }
      }

      return msgElement;
    }).filter(Boolean);

    // Batch DOM updates in animation frame for performance
    if (newElements.length > 0) {
      requestAnimationFrame(() => {
        newElements.forEach(elem => chatContainer.appendChild(elem));

        this.dispatchEvent(new CustomEvent('messages-updated', { detail: { newMessages: newElements.map(el => el.getAttribute('data-chat-id')) } }));

        // Scroll to bottom to show latest message
        // Use a second frame to ensure elements are fully rendered
        requestAnimationFrame(() => {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      });
    }
  }

}