import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { Button } from "@/components/ui/button";
import { useSignal } from "@preact/signals";
import { listAgents, type Agent } from '@tkottke90/ai-assistant-client';
import { useEffect } from "preact/hooks";

// Pure utility functions for pagination navigation
function canGoToNextPage(currentPage: number, totalPages: number): boolean {
  return currentPage < totalPages;
}

function canGoToPreviousPage(currentPage: number): boolean {
  return currentPage > 1;
}

export function AgentsPage() {
  const agents = useSignal<Agent[]>([]);
  const currentPage = useSignal(1);
  const itemsPerPage = 10;
  const totalPages = useSignal(1);
  const totalCount = useSignal(0);

  const fetchAgents = () => {
    void listAgents({ page: currentPage.value, take: itemsPerPage }).then(response => {
      agents.value = response.data;
      totalPages.value = response.pagination.totalPages;
      totalCount.value = response.pagination.totalCount;
    }).catch(error => {
      console.error('Error fetching agents:', error);
    });
  };

  useEffect(() => {
    fetchAgents();
  }, [currentPage.value]);

  const handleNextPage = () => {
    if (canGoToNextPage(currentPage.value, totalPages.value)) {
      currentPage.value += 1;
    }
  };

  const handlePreviousPage = () => {
    if (canGoToPreviousPage(currentPage.value)) {
      currentPage.value -= 1;
    }
  };

  return (
    <BaseLayout className="flex flex-col gap-2 dark:bg-elevated">
      <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Agents</h2>
        </span>
        <span>
          <Button variant="default" size="sm">
            Create Agent
          </Button>
        </span>
      </header>
      <main className="w-full grow overflow-y-auto">

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Description</th>
              <th className="text-left p-2">Version</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.value.map(agent => (
              <tr key={agent.agent_id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="p-2">{agent.name}</td>
                <td className="p-2">{agent.description || '-'}</td>
                <td className="p-2">{agent.version}</td>
                <td className="p-2">
                  <button className="px-2 py-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                    Edit
                  </button>
                  <button className="px-2 py-1 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ml-2">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
      <footer className="flex items-center justify-between p-4 border-t dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Page {currentPage.value} of {totalPages.value} ({totalCount.value} total agents)
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage.value === 1}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage.value === totalPages.value}
          >
            Next
          </Button>
        </div>
      </footer>
    </BaseLayout>
  )
}