import type { BaseProps } from "@/lib/utility-types";
import { cn } from "@/lib/utils";
import { useSignal } from "@preact/signals";
import { Check, Copy, ExternalLink } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

async function copyPreContent(element: HTMLPreElement | null, copied: { value: boolean }) {
  if (!element) return;
  
  await navigator.clipboard.writeText(element.innerText);
  
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);

  toast.success('Code copied to clipboard', { dismissible: true, duration: 1000 });
}

function getCodeLanguage(children: ComponentChildren): string | undefined {

  if (!(children as any)?.props.className) return undefined;
  
  const match = (children as any).props.className.match(/language-(.*)/);
  
  return match ? match[1] : undefined;
}

function ThinkingCodeBlock({ children, ...props }: BaseProps<{}>) {
  return (
    <details className="px-4 py-2
    border border-slate-500 rounded bg-slate-600/30 open:border-slate-400/50">
      <summary className="cursor-pointer animate-pulse border-b border-slate-400/0 open:border-slate-400/50">Thinking</summary>
      <p className="text-sm **:bg-transparent">{children}</p>
    </details>
  );
}

function ToolCallCodeBlock({ children, ...props }: BaseProps<{}>) {
  return (
    <details className="px-4 py-2
    border border-slate-500 rounded bg-slate-600/30 open:border-slate-400/50">
      <summary className="cursor-pointer">Calling Tool....</summary>
      <pre>{children}</pre>
    </details>
  );
}

function ToolResultCodeBlock({ children, ...props }: BaseProps<{}>) {
  const toolDetails = useMemo(() => {
    try {
      const content = (children as any).props.children;

      return JSON.parse(content);
    } catch (err) {
      return {
        tool: 'Unknown Tool',
        args: {},
        response: [
          'Unable to parse tool response. Displaying raw content:',
          (children as any).props.children
        ].join('\n\n')
      }
    }


  }, [children]);
  
  return (
    <details className="px-4 py-2 mb-4
    border border-slate-500 rounded bg-slate-600/30 open:border-slate-400/50">
      <summary className="cursor-pointer">Used Tool: { toolDetails.name }</summary>
      <br />
      <h5>Input Arguments</h5>
      <pre className="whitespace-pre-wrap">
        {JSON.stringify(toolDetails.args, null, 2)}
      </pre>
      <h5>Tool Response</h5>
      <pre className="whitespace-pre-wrap">
        {JSON.stringify(toolDetails.response, null, 2)}
      </pre>
    </details>
  );
}

function CodeBlock({ children, ...props }: preact.JSX.HTMLAttributes<HTMLPreElement>) {
  const copied = useSignal(false);
  const ref = { current: null as HTMLPreElement | null };

  const codeLang = getCodeLanguage(children);

  if (codeLang === 'tool-call') {
    return <ToolCallCodeBlock>{children}</ToolCallCodeBlock>
  }
  
  if (codeLang === 'tool-result') {
    return <ToolResultCodeBlock>{children}</ToolResultCodeBlock>
  }

  if (codeLang === 'thinking') {
    return <ThinkingCodeBlock>{children}</ThinkingCodeBlock>
  }

  return (
    <div className="relative group">
      <pre className={cn(props.className, 'bg-[#222] **:bg-[#222] text-white opacity-100')} ref={(el) => { ref.current = el; }} {...props}>
        {children}
      </pre>
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-white/80 capitalize">{codeLang}</span>
        <button
          onClick={() => copyPreContent(ref.current, copied)}
          className="p-1 cursor-pointer rounded
          bg-muted hover:bg-muted/80 text-muted-foreground"
          aria-label="Copy code"
        >
          {copied.value ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
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