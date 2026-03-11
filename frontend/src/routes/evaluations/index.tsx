import { Dialog } from "@/components/dialog";
import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EvaluationsPage() {


  return (
    <BaseLayout className="flex flex-col">
       <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Evaluations</h2>
        </span>
        <span className="flex gap-2">
          <Dialog
            title="Create New Eval"
            trigger={<button className={cn(buttonVariants({ variant: 'default', size: 'default', className: '' }))}>Create Data Set</button>}
          >
            <h2>Create New Prompt</h2>
          </Dialog>
        </span>
      </header>
    </BaseLayout>
  );
}