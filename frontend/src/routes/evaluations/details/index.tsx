import BaseLayout, { BaseLayoutShowBtn } from "@/components/layouts/base.layout";

export function EvaluationDetailsPage() {
  
  return (
    <BaseLayout>
       <header className="flex gap-2 items-center w-full justify-between">
        <span className="flex gap-2 items-center">
          <BaseLayoutShowBtn />
          <h2 className="inline">Details</h2>
        </span>
        <span>

        </span>
      </header>
    </BaseLayout>
  );
}