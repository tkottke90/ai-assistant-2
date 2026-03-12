import { Collapsable } from "@/components/collapsable-section";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BaseProps } from "@/lib/utility-types";
import { Signal, useSignal } from "@preact/signals";
import { Trash2 } from "lucide-preact";
import { Plus } from "lucide-react";
import { Fragment } from "preact/jsx-runtime";

export function TestCases({ scoringInProgress }: BaseProps<{scoringInProgress: Signal<boolean>}>) {
  const testCases = useSignal<TestCase[]>([]);

  return (
    <Collapsable
      title="Tests"
      startedOpen={true}
      mobileOnly
      className="shrink-0"
    >
      <Tabs defaultValue="llm" className="w-full h-full">
          <TabsList variant="line" className="
            *:text-neutral-800 dark:*:text-neutral-200 
            *:data-[state=active]:*:text-neutral-800 dark:*:data-[state=active]:text-neutral-200
            *:data-[state=active]:after:border-neutral-300 dark:*:data-[state=active]:after:border-neutral-600
          ">
            <TabsTrigger value="llm">Test Data</TabsTrigger>
            <TabsTrigger value="tools">Evaluations</TabsTrigger>
            <TabsTrigger disabled={!scoringInProgress.value} value="scoring">Scoring</TabsTrigger>
          </TabsList>
          <TabsContent value="llm" className="h-full overflow-auto">
            <TestCaseList testCases={testCases} /> 
          </TabsContent>
          <TabsContent value="tools">
            <EvaluationsList />
          </TabsContent>
          <TabsContent value="scoring">
            <Scoring />
          </TabsContent>
        </Tabs>
       
    </Collapsable>
  )
}

interface TestCase {
  id: string;
  input: string;
  output: string;
  type: 'text' | 'tool';
}

function TestCaseList({ testCases }: { testCases: Signal<TestCase[]> }) {

  return (
    <Fragment>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => {
            testCases.value = [
              ...testCases.value,
              {
                id: crypto.getRandomValues(new Uint32Array(8))[0].toString(),
                input: "",
                output: "",
                type: "text"
              }
            ]
          }}
        >
          <Plus size={14} />
          Add
        </Button>
      </div>
      <form className="overflow-auto flex flex-col gap-2" >
        {testCases.value.map(testCase => {
          return (
            <TestCase key={testCase.id} testCase={testCase} />
          )
        })}
      </form>
      <br />
      <br />
    </Fragment>
  )
}

function TestCase({ testCase }: { testCase: TestCase }) {

  return (
    <div className="flex flex-col gap-2 w-full p-2">
      <input hidden name="id" value={testCase.id} />
      <div className="flex gap-2 *:rounded *:min-h-18">
        <textarea name="" id="input" className="grow border border-zinc-300 p-2" placeholder="Input" />
        <textarea name="" id="output" className="grow border border-zinc-300 p-2" placeholder="Expected Output" />
      </div>
      <div className="flex justify-between gap-2 w-full p-2">
        <select name="" id="" className="w-32 px-2 rounded" >
          <option value="text">Text</option>
          <option value="tool">Tool</option>
        </select>
        <Button
          variant="iconDestructive"
          size="icon-sm"
          type="button"
          onClick={() => {}}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  )
}

function EvaluationsList() {

  return (
    <Fragment>
      <div>
        <p className="text-center">No evaluations yet</p>
      </div>
    </Fragment>
  )
}

function Scoring() {
  return (
    <Fragment>
      <div>
        <p className="text-center">No Results to Score</p>
      </div>
    </Fragment>
  ) 
}