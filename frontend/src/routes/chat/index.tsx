import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button } from "@/components/ui/button";
import { formatChatTimestamp } from "@/lib/date-utils";
import { SendHorizonal } from "lucide-preact";
import { useRef, useEffect } from "preact/hooks";

interface ChatAsset {
  id: number;
  url: string;
  nsfw?: boolean;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
  usage?: {
    prompt_tokens: number;
    response_tokens: number;
    total_tokens: number;
  }
  assets?: ChatAsset[];
  actions?: {
    label: string;
    url?: string;
    destructive?: boolean; // If true, the action is styled as a destructive action (e.g., red button)
  }[]
  severity?: 0 | 1 | 2 | 3; // For system messages, indicates the severity of the message (0 = info, 1 = warning, 2 = error, 3 = critical)
}

const severityStyles = {
  0: "bg-blue-300/35 border-blue-500",
  1: "bg-orange-300/35 border-orange-500",
  2: "bg-red-300/35 border-red-500",
  3: "bg-red-300/35 border-red-500 font-bold"
}

const tempChats: ChatMessage[] = [
  { id: 0, role: 'user', content: 'Hello, how are you?', created_at: new Date() },
  { id: 7, role: 'user', content: 'Hello, how are you?', created_at: new Date(), assets: [
    { id: 0, url: '/api/v1/assets/1/view', nsfw: false },
    { id: 2, url: '/api/v1/assets/1/view', nsfw: true },
    { id: 3, url: '/api/v1/assets/1/view', nsfw: true },
  ] },
  { id: 1, role: 'assistant', content: 'I am fine, thank you! How can I assist you today?', created_at: new Date() },
  { id: 2, role: 'user', content: 'Can you tell me a joke?', created_at: new Date() },
  { id: 3, role: 'assistant', content: 'Sure! Why don\'t scientists trust atoms? Because they make up everything!', created_at: new Date() },
  { id: 5, role: 'system', content: 'Action Taken', actions: [], created_at: new Date(), severity: 1 },
  { id: 6, role: 'system', content: 'There was an error', actions: [], created_at: new Date(), severity: 2 },
  { id: 4, role: 'system', content: 'Approve this action', actions: [
    { label: 'Reject', url: '/api/v1/activity/1/reject', destructive: true },
    { label: 'Approve', url: '/api/v1/activity/1/approve' },
  ], created_at: new Date() },
]

function ChatMessage({ message }: { message: ChatMessage}) {
  
  // Display system messages differently, since they are not part of the conversation, but rather a call to action for the user
  if (message.role === "system") {
    return (
      <div className={`p-4 rounded-md border md:min-w-1/2 md:mx-auto ${severityStyles[message.severity ?? 0]}`}>
        <p className="text-sm  mb-2">{message.content}</p>
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


  return (
    <div 
      className="group grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr] data-[role=user]:grid-cols-[1fr_auto] gap-2 text-sm md:text-base"
      data-role={message.role}
    >
      <header className="col-span-2 row-start-1 group-data-[role=user]:text-right text-sm text-neutral-200/50">
        { formatChatTimestamp(message.created_at) }
      </header>
      <aside className={`row-start-2 col-start-1 group-data-[role=user]:text-right group-data-[role=user]:col-start-2 w-8`}>
        <div className="w-8 h-8 flex justify-center items-center rounded-full bg-avatar-assistant group-data-[role=user]:bg-avatar-user">{message.role.charAt(0).toUpperCase()}</div>
      </aside>
      <main className={`row-start-2 col-start-2 bg-neutral-300 dark:bg-neutral-500 p-4 dark:text-white max-w-8/12
        group-data-[role=assistant]:rounded-r-md group-data-[role=assistant]:rounded-bl-md group-data-[role=assistant]:mr-auto
        group-data-[role=user]:rounded-l-md group-data-[role=user]:rounded-br-md  group-data-[role=user]:text-right group-data-[role=user]:col-start-1 group-data-[role=user]:ml-auto`}
      >
        { message.assets && (
          <div className="flex gap-2 mb-2 overflow-hidden rounded">
            {message.assets.map(asset => (
              <img data-nsfw={asset.nsfw} key={asset.id} src={asset.url} alt={`Asset ${asset.id}`} className="rounded-md border h-32 w-32 object-cover data-nsfw:blur-sm overflow-clip focus:border-blue-400" />
            ))}
          </div>
        )}
        <p>{message.content}</p>
      </main>
      <footer className={`col-span-2 row-start-3 flex group-data-[role=user]:flex-row-reverse`}></footer>
    </div>
  )
}

function ChatList({ messages }: {messages: ChatMessage[]}) {
  const scrollableContainer = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!scrollableContainer.current) return;

    scrollableContainer.current?.scrollTo({
      behavior: "smooth",
      top: scrollableContainer.current?.scrollHeight,
    });
  }, [messages]);
  
  return (
    <div className="flex flex-col gap-2 pb-8" ref={scrollableContainer} >
      {messages.map(message => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </div>
  )
}

function ChatForm() {
  return (
    <form className="w-full flex flex-row gap-2">
      <textarea className="w-full h-24 p-2 rounded-md border border-neutral-400/50 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none" placeholder="Type your message here..."></textarea>
      <Button variant="default" type="button" size="icon">
        <span class="hidden lg:inline">Send</span>
        <SendHorizonal size={20} class="inline lg:hidden" />
      </Button>
      
    </form>
  )
}

export function ChatPage() {
  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Chat</h2>
        </span>
        <span>

        </span>
      </header>
      <main className="w-full grow overflow-y-auto">
        <ChatList messages={tempChats} />
      </main>
      <footer className="w-full">
        <ChatForm />
      </footer>
    </BaseLayout>
  )
}