import { Dialog, useDialog } from "@/components/dialog";
import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button, buttonVariants, ConfirmButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { batch, useSignal } from "@preact/signals";
import { createAgent, deleteAgent, listAgents, startAgent, stopAgent, type AgentListResponse } from '@tkottke90/ai-assistant-client';
import { Bot, BotOff, Pencil, Trash2, TriangleAlert } from "lucide-preact";
import { useCallback, useEffect } from "preact/hooks";
import { toast } from "sonner";

// Pure utility functions for pagination navigation
function canGoToNextPage(currentPage: number, totalPages: number): boolean {
  return currentPage < totalPages;
}

function canGoToPreviousPage(currentPage: number): boolean {
  return currentPage > 1;
}

function useApi<T>(apiCall: () => Promise<T>) {
  const value = useSignal<T | null>(null);
  const loading = useSignal(false);
  const error = useSignal<Error | null>(null);

  // Memoized execute function to call the API and manage state
  const execute = useCallback(() => {
    return apiCall()
      .then(result => {
        // On success, update value and clear error
        batch(() => {
          value.value = result;
          error.value = null;
        });
        return result;
      })
      .catch(err => {
        // On error, log and update error state
        console.error('API call error:', err);
        error.value = err instanceof Error ? err : new Error(String(err));
      })
      .finally(() => {
        // Always set loading to false after completion
        loading.value = false;
      });
  }, [apiCall]);


  return { value, loading, error, execute };
}

export function AgentsPage() {
  const currentPage = useSignal(1);
  const itemsPerPage = useSignal(10);
  const totalPages = useSignal(1);
  const totalCount = useSignal(0);

  const agents = useApi(() => listAgents({ take: itemsPerPage.value, page: currentPage.value }));

  const refreshAgents = useCallback(() => {
    agents.execute()
      .then(value => {
        if (value) {
          currentPage.value = value.pagination.page;
          totalPages.value = value.pagination.totalPages;
          totalCount.value = value.pagination.totalCount;
        }
      })
  }, [agents]);

  useEffect(() => {
    refreshAgents();
  }, []);

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Agents <span className="text-base opacity-50">({totalCount} Agents)</span></h2>
        </span>
        <span>
          <Dialog
            title="Create New Agent"
            trigger={<button className={cn(buttonVariants({ variant: 'default', size: 'default', className: '' }))}>Create Agent</button>}
            onClose={() => {
              refreshAgents();
            }}
          >
            <CreateAgentForm />
          </Dialog>
        </span>
      </header>
      <main className="w-full grow overflow-y-auto">

        {agents.loading.value && (
          <p>Loading</p>
        )}

        {agents.loading.value === false && agents.value.value && (
          <AgentList agents={agents.value.value.data} onChange={() => { refreshAgents() }} />
        )}

      </main>
      <footer className="flex items-center justify-between p-4 border-t dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Page {currentPage.value} of {totalPages.value} ({totalCount.value} total agents)
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              if (canGoToPreviousPage(currentPage.value)) {
                currentPage.value += 1;
              }
            }}
            disabled={currentPage.value === 1}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            onClick={()  => {
              if (canGoToNextPage(currentPage.value, totalPages.value)) {
                currentPage.value += 1;
              }
            }}
            disabled={currentPage.value === totalPages.value}
          >
            Next
          </Button>
        </div>
      </footer>
    </BaseLayout>
  )
}

function AgentList({ agents, onChange }: { agents: AgentListResponse[], onChange: () => void }) {

  // When there are no agents, we can show a friendly message encouraging the user to create their first agent
  if (agents.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <Bot size={48} className="text-gray-400" />
        <p className="text-gray-600 dark:text-gray-400">No agents found. Create your first agent to get started!</p>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col gap-2 lg:flex-wrap lg:flex-row">
      {agents.map(agent => (
        <div key={agent.agent_id} className="min-w-75 p-4 border rounded border-neutral-500/75 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 w-full lg:max-w-[49%]">
          <header className="flex justify-between">
            <h3 className="text-lg font-medium">
              <span>{agent.name}</span>
              <span className="ml-2 px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-800/50 dark:text-gray-300/50">Version: {agent.version}</span>
            </h3>
            <div className="flex gap-4 lg:gap-2">
              <Button variant="iconDefault" size="icon-xs"
                onClick={() => {
                  if (agent.is_active) {
                    // Stop the agent
                    stopAgent({ id: agent.agent_id })
                      .then(() => {
                        onChange();
                        toast.success('Agent stopped successfully', {  });
                      });
                  } else {
                    // Start the agent
                    startAgent({ id: agent.agent_id })
                      .then(() => {
                        onChange();
                        toast.success('Agent started successfully');
                      });
                  }
                }}
              >
                { !agent.is_active &&  <BotOff className="size-full" /> }
                { agent.is_active && <Bot className="size-full" /> }
              </Button>
              <Button variant="iconInfo" size="icon-xs">
                <Pencil className="size-full" />
              </Button>
              <ConfirmButton onConfirm={() => {
                deleteAgent({ id: agent.agent_id }).then(() => {
                  onChange();
                  toast.success('Agent deleted successfully');
                }) 
              }} size="icon-xs">
                <Trash2 className="size-full group-data-[confirm=true]:hidden" />
                <TriangleAlert className="size-full hidden group-data-[confirm=true]:block" />
              </ConfirmButton>
            </div>
          </header>

          <p className="text-sm text-gray-600 dark:text-gray-400">{agent.description}</p>
        </div>
      ))}
    </div>
  )

}

function AgentDisplay({ agent }: { agent: AgentListResponse }) {}

function CreateAgentForm() {
  const dialog = useDialog();
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  return (
     <form className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();

        loading.value = true;

        const formData = new FormData(e.currentTarget);
        const name = formData.get('agent-name') as string;
        const description = formData.get('agent-description') as string;

        createAgent({
          name,
          description,
          system_prompt: 'You are the member of an AI Team. Collaborate with the user and other agents to complete tasks and achieve goals.',
          auto_start: false
        }).then(() => {
            dialog.close();
          })
          .catch(err => {
            console.error('Error creating agent:', err);
            error.value = err instanceof Error ? err.message : String(err);
          })
          .finally(() => {
            loading.value = false;
          });
      }}
     >
      <div className="flex flex-col gap-1">
        <label htmlFor="agent-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Agent Name</label>
        <input
          id="agent-name"
          name="agent-name"
          type="text"
          className="px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200 dark:bg-gray-700 dark:border-gray-600 dark:focus:ring-gray-500"
          placeholder="Enter agent name"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="agent-description" className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
        <textarea
          id="agent-description"
          name="agent-description"
          className="px-3 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-200 dark:bg-gray-700 dark:border-gray-600 dark:focus:ring-gray-500"
          placeholder="Enter agent description (optional)"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => {
          dialog.close();
        }}>Cancel</Button>
        <Button
          type="submit"
          variant="constructive"
          className="group transition-all duration-300 ease-in-out overflow-hidden"
          data-loading={loading.value}
          disabled={loading.value}
        >
          { loading.value && <Spinner />}
          <span>Create</span>
        </Button>
      </div>

      { error.value && 
        <p className="text-sm text-red-600 dark:text-red-400">
          {error.value}
        </p>
      }
    </form>
  )
}