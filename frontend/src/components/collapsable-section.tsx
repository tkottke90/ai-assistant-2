import { useIsMobile } from '@/hooks/use-is-mobile';
import type { BaseProps } from '@/lib/utility-types';
import { cn } from '@/lib/utils';
import { useSignal } from '@preact/signals';
import { ChevronDown } from 'lucide-preact';


export function Collapsable({ children, className, title, startedOpen, mobileOnly = false }: BaseProps<{ title: string, startedOpen?: boolean, mobileOnly?: boolean }>) {
  const isMobile = useIsMobile();
  const collapsed = useSignal((startedOpen && mobileOnly === false) ?? true);

  const showIcon = mobileOnly ? isMobile.value : true;

  return (
    <section
      className={cn(
        'overflow-hidden transition-all duration-300 min-h-12 max-h-12 data-col data-[collapse=false]:max-h-250 group',
        mobileOnly ? 'lg:max-h-250' : '',
        className
      )}
      data-collapse={collapsed.value}
    >
      <header
        className="flex gap-2 items-center justify-between">
        <h4>{title}</h4>
        {showIcon && <ChevronDown
          className="size-6 group-data-[collapse=false]:rotate-180 transition-transform"
          onClick={() => {
            collapsed.value = !collapsed.value
          }}
        />}
      </header>
      <br />
      {children}
    </section>
  )
}
