import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { listAgents } from '@tkottke90/ai-assistant-client';
import { useMemo } from "preact/hooks";

export function AgentsPage() {
  const agents = useMemo(() => {
    return listAgents({})
  }, [])

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Agents</h2>
        </span>
        <span>

        </span>
      </header>
      <main className="w-full grow overflow-y-auto">
        {/* Agent list goes here */}
      </main>
    </BaseLayout>
  )
}