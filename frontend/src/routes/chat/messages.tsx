import { MarkdownDisplay } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { formatChatTimestamp } from '@/lib/date-utils';
import type { ChatMessage, ServerAction, InteractionMessage } from '@tkottke90/ai-assistant-client';


const severityStyles = {
  0: "bg-blue-300/35 border-blue-500",
  1: "bg-orange-300/35 border-orange-500",
  2: "bg-red-300/35 border-red-500",
  3: "bg-red-300/35 border-red-500 font-bold"
}

function ActionMessage({ message }: {message: ServerAction}) {
  return (
    <div className={`p-4 rounded-md border min-w-10/12 xl:min-w-1/2 mx-auto ${severityStyles[message.severity ?? 0]}`}>
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

function InteractionMessage({ message }: {message: InteractionMessage}) {
  return (
    <div 
      className="group grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr] data-[role=human]:grid-cols-[1fr_auto] gap-2 text-sm md:text-base"
      data-role={message.role}
    >
      <header className="col-span-2 row-start-1 group-data-[role=human]:text-right text-sm text-neutral-200/50">
        { formatChatTimestamp(new Date(message.created_at)) }
      </header>
      <aside className={`row-start-2 col-start-1 group-data-[role=human]:text-right group-data-[role=human]:col-start-2 w-8`}>
        <div className="w-8 h-8 flex justify-center items-center rounded-full bg-avatar-assistant group-data-[role=human]:bg-avatar-user">{message.role.charAt(0).toUpperCase()}</div>
      </aside>
      <main className={`row-start-2 col-start-2 bg-neutral-300 dark:bg-neutral-500 p-4 dark:text-white max-w-8/12
        group-data-[role=assistant]:rounded-r-md group-data-[role=assistant]:rounded-bl-md group-data-[role=assistant]:mr-auto
        group-data-[role=human]:rounded-l-md group-data-[role=human]:rounded-br-md  group-data-[role=human]:text-right group-data-[role=human]:col-start-1 group-data-[role=human]:ml-auto`}
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
        <MarkdownDisplay>{message.content}</MarkdownDisplay>
      </main>
      <footer className={`col-span-2 row-start-3 flex group-data-[role=human]:flex-row-reverse`}></footer>
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