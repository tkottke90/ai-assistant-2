import { MarkdownDisplay } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { formatChatTimestamp } from '@/lib/date-utils';
import type { ChatMessage, InteractionMessage, ServerAction } from '@tkottke90/ai-assistant-client';
import { Files } from 'lucide-preact';
import { useChatContext } from './chat-context';
import { toast } from 'sonner';
import { batch, useComputed, useSignal, useSignalEffect } from '@preact/signals';
import { useWorkerEventListener } from '@/lib/workerClient';
import { buildUserMessage, buildAssistantMessage } from './chat-utils';


const severityStyles = {
  0: "bg-blue-300/35 border-blue-500",
  1: "bg-orange-300/35 border-orange-500",
  2: "bg-red-300/35 border-red-500",
  3: "bg-red-300/35 border-red-500 font-bold"
}

function getToolSummary(message: ServerAction): string | undefined {
  if (message.metadata?.tool_summary) return message.metadata.tool_summary as string;
  // Derive a summary for historical messages where tool_summary was not persisted
  const toolName = message.metadata?.tool_name as string | undefined;
  if (toolName) return `${toolName}: ${message.content}`.slice(0, 120);
  return undefined;
}

function formatRawContent(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function ActionMessage({ message }: {message: ServerAction}) {
  const summary = getToolSummary(message);
  return (
    <div className={`p-4 rounded-md border min-w-10/12 max-w-3/4 xl:min-w-1/2 mx-auto ${severityStyles[message.severity ?? 0]}`}>
      {summary ? (
        <div className="mb-2">
          <h4>Tool: {message.metadata.tool_name ?? ''}</h4>
          <p>{summary}</p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-current/60 select-none">Show raw output</summary>
            <pre className="text-xs mt-2 overflow-auto whitespace-pre-wrap break-all opacity-75">{formatRawContent(message.content)}</pre>
          </details>
        </div>
      ) : (
        <p className="mb-2">{message.content}</p>
      )}
      <div className="flex gap-2 justify-end">
        {message.actions?.map((action, index) => (
          <Button 
            key={index}
            variant={action.destructive ? "destructive" : "constructive"} 
          >{action.label}</Button>
        ))}
      </div>
    </div>
  )
}

function InteractionMessage({ message }: {message: InteractionMessage}) {
  const { isStreaming } = useChatContext();

  return (
    <div 
      className="group grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr] data-[role=human]:grid-cols-[1fr_auto] gap-2 md:text-base"
      data-role={message.role}
    >
      <header className="col-span-2 row-start-1 group-data-[role=human]:text-right text-neutral-200/50">
        { formatChatTimestamp(new Date(message.created_at)) }
        { message.role !== 'human' && message.model && ` - ${message.model}` }
      </header>
      <aside className={`row-start-2 col-start-1 group-data-[role=human]:col-start-2 w-8`}>
        <div className="w-8 h-8 flex justify-center items-center rounded-full bg-avatar-assistant group-data-[role=human]:bg-avatar-user">
          { (message.name ?? message.role).charAt(0).toUpperCase()}
        </div>
      </aside>
      <main className={`row-start-2 col-start-2 group-data-[role=human]:bg-neutral-300 group-data-[role=human]:dark:bg-neutral-500 p-4 group-data-[role=human]:dark:text-white max-w-11/12 xl:max-w-10/12
        group-data-[role=assistant]:rounded-r-md group-data-[role=assistant]:rounded-bl-md group-data-[role=assistant]:mr-auto
        group-data-[role=human]:rounded-l-md group-data-[role=human]:rounded-br-md  group-data-[role=human]:col-start-1 group-data-[role=human]:ml-auto group`}
      >
        { message.assets && (
          <div className="flex gap-2 mb-2 overflow-hidden rounded empty:hidden">
            {message.assets.map(asset => (
              <img
                data-nsfw={asset.nsfw}
                key={asset.id} src={asset.url}
                alt={`Asset ${asset.id}`}
                className="rounded-md border h-32 w-32 object-cover data-[nsfw=true]:blur-sm overflow-clip focus:border-blue-400"
                onClick={(e) => {
                  const target = e.target as HTMLImageElement;

                  // If the image is not NSFW, do nothing.  These should always be visible
                  if (!asset.nsfw) return;

                  // If the image is NSFW, toggle the blur
                  if (target.dataset.nsfw === "true") {
                    target.dataset.nsfw = "false";
                  } else {
                    target.dataset.nsfw = "true";
                  }
                }}
              />
            ))}
          </div>
        )}
        <MarkdownDisplay className="group" data-isStreaming={isStreaming.value}>{message.content}</MarkdownDisplay>
        { isStreaming.value && message.role !== 'human' && (
          <div className="flex items-center gap-1 py-1">
            <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:-0.32s]" />
            <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:-0.16s]" />
            <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" />
          </div>
        )}
      </main>
      <footer className="col-span-2 row-start-3 flex gap-3
        group-data-[role=human]:flex-row-reverse opacity-50 pl-8 group-data-[role=human]:pr-8"
      >
        <div className="flex items-center gap-4 text-sm">
          {/*  Token Usage  */}
          <span className="group-data-[role=human]:hidden my-auto">
            { Intl.NumberFormat('en', { notation: 'standard' }).format(message.usage?.total ?? 0) } tokens
          </span>
          
          {/*  Token Rate  */}
          <span className="group-data-[role=human]:hidden my-auto">
            { Intl.NumberFormat('en', { notation: 'standard' }).format(message?.stats?.tokensPerSecond ?? 0) } t/s
          </span>
          
          {/*  Tool Usage  */}
          <span className="group-data-[role=human]:hidden my-auto">
            { message.stats?.toolsUsed ? `${message?.stats?.toolsUsed} tool(s) used` : null }
            { message.stats?.toolFailures ? ` (${message?.stats?.toolFailures} failures)` : null }
          </span>
        </div>
        
        {/*  Action Items  */}
        <span className="p-2 rounded-full active:bg-neutral-500 cursor-pointer">
          <Files size={20} title="Copy" onClick={() => {
            navigator.clipboard.writeText(message.metadata?.copyContent ?? message.content).then(() => {
              // Optionally, you could add some feedback to the user here, like a toast notification.
              toast.success('Copied to clipboard', { duration: 1000 });
            }).catch(err => {
              console.error('Failed to copy text: ', err);
            });
          }} />
        </span>
      </footer>
    </div>
  );
} 


export function ChatMessageDisplay({ message }: {message: ChatMessage}) {
  switch(message.type) {
    case 'server_action':
      return <ActionMessage message={message} />
    case 'chat_message':
      return <InteractionMessage message={message} />
  }
}

export function ChatList() {
  const { thread, isStreaming } = useChatContext();

  // Holds the current "turn" of messages while the assistant is
  // streaming it's response
  const assistantMessage = useSignal<ChatMessage | null>(null);

  const messages = useComputed(() => {
    return (thread.value.history ?? []) as ChatMessage[];
  });
 
  
  useWorkerEventListener('chat:stream:start', (e) => {
    
    batch(() => {
      assistantMessage.value = buildAssistantMessage(e.detail.assistantName ?? 'assistant');
    })
  });
  
  useWorkerEventListener('chat:stream:done', (e) => {
    
    batch(() => {
      assistantMessage.value = null;
    })
  });

  useWorkerEventListener('chat:stream:data', (e) => {
    assistantMessage.value  = {
      ...assistantMessage.value!,

      // TODO: fix this typing
      ...(e.detail as any).content
    };
  });

  return (
    <div className="flex flex-col gap-2 pb-8">
      {messages.value.map(message => (
        <ChatMessageDisplay key={message.id} message={message} />
      ))}

      { /* Capture message for streamed response */}
      { isStreaming.value && assistantMessage.value && <ChatMessageDisplay message={assistantMessage.value} /> }
    </div>
  );
}