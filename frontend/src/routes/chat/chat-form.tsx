import { Button } from "@/components/ui/button";
import type { Signal } from "@preact/signals";
import { SendHorizonal } from "lucide-preact";

async function submit(e: SubmitEvent) {
  e.preventDefault();

  // Extract message and threadId from the form
  const form = e.currentTarget as HTMLFormElement;
  const formData = new FormData(form);
  const message = formData.get('message') as string;
  const threadId = formData.get('threadId') as string;

  form.reset();

  form.querySelector('#threadId')?.setAttribute('value', threadId); // Reset the threadId input since form.reset() will clear it

  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, threadId }),
  });

  if (!response.body) throw Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));

        if (!data.chunk[0]?.kwargs?.content) continue; // Skip content chunks, we only want updates and messages for this example

        console.log(data.chunk[0].kwargs?.content);
      }
    }
  }
}

export function ChatForm({ threadId }: { threadId: Signal<string> }) {
  return (
    <form className="w-full flex flex-row gap-2"
      onSubmit={submit}
    >
      <input type="text" hidden id="threadId" name="threadId" value={threadId.value} />

      <div className="w-full border border-neutral-500/50 rounded-md">
        <div id="file-container" className="flex gap-2"></div>

        <textarea
          className="w-full h-24 p-2 rounded-md focus:ring-0 focus:outline-none resize-none"
          placeholder="Type your message here..."
          name="message"  
        />
      </div>
      
      <Button variant="default" type="submit">
        <span class="hidden lg:inline">Send</span>
        <SendHorizonal size={20} class="inline lg:hidden" />
      </Button>
      
    </form>
  )
}
