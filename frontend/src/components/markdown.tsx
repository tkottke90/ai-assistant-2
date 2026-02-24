import type { BaseProps } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";


export function MarkdownDisplay(props: BaseProps<{ children: string }>) {

  return (
    <div className={cn("prose orderList unorderList list select-text overflow-visible", props.className)}>
      <Markdown remarkPlugins={[remarkGfm]}>{props.children}</Markdown>
    </div>
  )
}