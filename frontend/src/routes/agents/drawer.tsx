import { Drawer } from "@/components/drawer";
import { buttonVariants, LoadingButton } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentListResponse } from "@tkottke90/ai-assistant-client";
import { Pencil } from "lucide-preact";
import { AgentTitle } from "./title";
import { Signal, useSignal } from "@preact/signals";
import { createContextWithHook } from "@/lib/utils";


const { Provider: AgentDrawerContext, useHook: useAgentDrawer } = createContextWithHook<{
  agent: Signal<AgentListResponse | null>;
}>()

interface iAgentDrawerProps {
  agent: AgentListResponse;
  onChange?: () => void;
}

export function AgentDrawer(props: iAgentDrawerProps) {
  const agent = useSignal(props.agent);

  return (
    <Drawer
      title={<AgentTitle agent={agent.value} />}
      trigger={<button className={buttonVariants({ size: "icon-xs", variant: "iconInfo" })}><Pencil className="size-full" /></button>}
      className="flex flex-col"
    >
      <AgentDrawerContext value={{ agent }}>
        <header className="mb-4">
          <p><strong>Description:&nbsp;</strong>{agent.value.description}</p>
        </header>
        <main className="grow">
          <Tabs defaultValue="system_prompt" className="w-full h-full">
            <TabsList variant="line" className="
              *:text-neutral-800 dark:*:text-neutral-200 
              *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
              *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
            ">
              <TabsTrigger value="system_prompt">System Prompt</TabsTrigger>
              <TabsTrigger value="tools">Tool Access</TabsTrigger>
              <TabsTrigger value="memories">Memories</TabsTrigger>
            </TabsList>
            <TabsContent value="system_prompt" className="h-full">
              <SystemPromptTab />
            </TabsContent>
            <TabsContent value="tools">Manage Agent Tool Access</TabsContent>
            <TabsContent value="memories">Change your password here.</TabsContent>
          </Tabs>
        </main>
      </AgentDrawerContext>
    </Drawer>
  )
}

function SystemPromptTab() {
  const { agent } = useAgentDrawer();

  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  return (
    <form className="h-full flex flex-col">
      <main className="grow p-2">
        <textarea
          id="system_prompt"
          name="system_prompt"
          disabled={loading.value}
          defaultValue={agent.value?.system_prompt ?? ''}
          className="w-full h-48 p-2 rounded-md resize-none
            bg-neutral-200 dark:bg-neutral-600
            
          "
          placeholder="You are a helpful assistant who tries to help the user as best as possible."
        />
      </main>
      <footer className="flex justify-end gap-2">
        <LoadingButton
          loading={loading}
          variant="constructive"
          type="button"
          onClick={() => {
            loading.value = true;

            setTimeout(() => {
              loading.value = false;
            }, 2000)
          }}
        >
          Save
        </LoadingButton>
      </footer>
    </form>
  )
}