/**
 * @typedef {Object} ChatMessage
 * @property {'human' | 'ai' | 'system' | 'tool'} type - The sender of the message ('user' or 'agent').
 * @property {string} content - The content of the message.
 * @property {string} id - Unique identifier for the message.
 * @additional_kwargs {Object} [additionalArgs] - Additional arguments for extensibility.
 * @response_metadata {Object} [responseMetadata] - Metadata related to the message response.
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


class ChatInterface {
  chatTemplate = `
<div data-type="chat-message" class="flex flex-wrap gap-2 max-w-[60%] data-user:items-end data-user:ml-auto data-user:flex-row-reverse group">
  <header class="text-sm font-semibold w-full group-data-user:text-right">
    <span name="timestamp"></span>
  </header>

  <p data-slot="avatar" class="w-8 h-8 mb-auto bg-blue-500 text-white rounded-full flex items-center justify-center font-bold"></p>

  <main class="white-space-pre-wrap py-6 px-4 bg-zinc-200 dark:bg-zinc-700 rounded-lg min-w-[300px] max-w-[140xch"></main>

  <footer class="text-sm group-data-user:text-right"></footer>
</div>
`;

templateStr = `
<div class="w-full h-full flex flex-col pb-2">
  <header class="flex items-center justify-end p-4">
    <button id="chat-clear">Clear</button>
  </header>
  <main class="flex-grow overflow-y-auto container-blur">
  
    <p id="chat-error" class="empty:hidden"></p>
  </main>
  <footer>
    <form class="flex px-4" id="chat-form">
      <input type="hidden" name="threadId" value="">
      <textarea name="message" rows="3" class="w-full p-2 resize-none border-none rounded-l-sm outline-none bg-zinc-300 bg-zinc-500 " placeholder="Type your message..."></textarea>
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
    fetch('/api/v1/agent/new-thread', {
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

      fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          thread_id: threadId,
          message: message
        })
      })
      .then(response => response.json())
      .then(data => {
        console.log('Chat response:', data);

        // Update chat history and UI
        if (data.messages) {
          this.chatHistory = data.messages;
          this.updateChats(this.chatHistory);
        }
      })
      .catch(error => {
        console.error('Error submitting chat message:', error);
        this.chatElement.querySelector('#chat-error').textContent = 'Error submitting message. Please try again.';
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
      await fetch(`/api/v1/agent/get-threads/${existingThreadid}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Thread not found');
          }
          return response.json();
        })
        .then(data => {
          console.log('Restored thread:', data);
          this.chatHistory = data.messages || [];

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
   * 
   * @param {ChatMessage[]} messages 
   */
  updateChats(messages) {
    const chatContainer = this.chatElement.querySelector('main');

    
    const newElements = messages.map((msg) => {
      // Check if message already exists by looking for [data-chatId="{msg.id}"]
      const existingMsg = chatContainer.querySelector(`[data-chat-id="${msg.id}"]`);
      
      if (existingMsg) {
        return; // Skip existing messages
      }

      const msgTemplate = document.createElement('template');
      msgTemplate.innerHTML = this.chatTemplate.trim();

      const msgElement = msgTemplate.content.querySelector('div');
      msgElement.setAttribute('data-chat-id', msg.id);

      const mainSlot = msgElement.querySelector('main');
      mainSlot.textContent = msg.content;

      return msgElement;
    }).filter(Boolean);

    requestAnimationFrame(() => {
      newElements.forEach(elem => chatContainer.appendChild(elem));
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }

}