import type { BaseProps } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { useSignal } from "@preact/signals";
import { Check, Copy, ExternalLink } from "lucide-preact";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

async function copyPreContent(element: HTMLPreElement | null, copied: { value: boolean }) {
  if (!element) return;
  await navigator.clipboard.writeText(element.innerText);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function CodeBlock({ children, ...props }: preact.JSX.HTMLAttributes<HTMLPreElement>) {
  const copied = useSignal(false);
  const ref = { current: null as HTMLPreElement | null };

  return (
    <div className="relative group">
      <pre ref={(el) => { ref.current = el; }} {...props}>
        {children}
      </pre>
      <button
        onClick={() => copyPreContent(ref.current, copied)}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-muted hover:bg-muted/80 text-muted-foreground"
        aria-label="Copy code"
      >
        {copied.value ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

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
          ),
          pre: ({ node, ...props }) => <CodeBlock {...props} />,
        }}
      >{props.children}</Markdown>
    </div>
  )
}