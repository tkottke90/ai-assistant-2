import type { BaseProps } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-preact";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";


export function MarkdownDisplay(props: BaseProps<{ children: string }>) {

  return (
    <div className={cn("prose orderList unorderList list select-text overflow-visible", props.className)}>
      <Markdown 
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
              {props.children}
              <ExternalLink size={12} />
            </a>
          )
        }}
      >{props.children}</Markdown>
    </div>
  )
}