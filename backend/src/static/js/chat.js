class ChatInterface {
  chatTemplate = `
<div class="grid grid-cols-[repeat(auto-fill,minmax(var(--min-size),auto))] gap-2">
  <header>
    <slot name="header"></slot>
  </header>
  <main>
    
  </main>
  <footer>
    <slot name="footer"></slot>
  </footer>
</div>
`;

templateStr = `
<div class="w-full h-full flex flex-col pb-2">
  <header class="flex items-center justify-end p-4">
    <button>Clear</button>
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
  chatHistory = [];

  constructor() {
    this.template = document.createElement("template");
  }

  get threadId() {
    const threadIdElem = this.template.content.querySelector('input[name="threadId"]');
    return threadIdElem.value;
  }

  createChatInterface() {
    this.template.innerHTML = this.templateStr.trim();

    const threadIdElem = this.template.content.querySelector('input[name="threadId"]');
    void this.createNewThread(threadIdElem);

    const form = this.template.content.getElementById('chat-form');
    this.registerChatSubmitHandler(form);

    return this.template.content.firstChild;
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
    })
    .catch(error => {
      console.error('Error creating new thread:', error);
    });
  }

  registerChatSubmitHandler(form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const form = event.target;
      const data = new FormData(form);

      const threadId = data.get('threadId');
      const message = data.get('message');

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
        // Optionally update chat history here
      })
      .catch(error => {
        console.error('Error submitting chat message:', error);
        this.template.querySelector('#chat-error').textContent = 'Error submitting message. Please try again.';
      });
    });
  }

}