import { Fragment } from "preact/jsx-runtime";
import { Button } from "../ui/button";
import { Sidebar } from "lucide-preact";
import { createContextWithHook } from "@/lib/utils";
import { Signal, useSignal } from "@preact/signals";
import { type ComponentProps } from "preact/compat";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Drawer } from "../drawer";
import { ThreadList } from "../thread-list";


const {
  Provider: SidebarContext,
  useHook: useAppContext
} = createContextWithHook<{
  dialog: Signal<EventTarget>;
}>()

function SidebarContents() {
  return (
    <div className="size-full flex flex-col">
      <main className="grow flex flex-col justify-start overflow-y-auto">
        <a className="w-full text-center py-4 px-6 hover:bg-neutral-500"  href="/agents">Agents</a>
        <a className="w-full text-center py-4 px-6 hover:bg-neutral-500"  href="/evaluations">Evaluations</a>
        <hr className="border-neutral-500/30 my-2 mx-4" />
        <ThreadList />
      </main>
      <footer>

      </footer>
    </div>
  )
}

export function AppSidebar() {
  const isMobile = useIsMobile();
  const { dialog } = useAppContext();

  return (
    <Fragment>
      <aside className="h-full min-w-75 hidden lg:block pt-6 base-layout--aside
      ">
        <header>
          <h2 className="text-center">AI Assistant</h2>
        </header>
        <SidebarContents />
      </aside>
      {
        isMobile.value &&
        <Drawer direction="left" showTrigger={false} eventTrigger={dialog} title="AI Assistant">
          <SidebarContents />
        </Drawer>
      }
    </Fragment>
  )
}

export function BaseLayoutShowBtn() {
  const { dialog } = useAppContext();
  const isMobile = useIsMobile();

  if (!isMobile.value || !dialog?.value) return null;

  return (
    <Button variant="ghost" onClick={() => {
      dialog.value.dispatchEvent(new CustomEvent("toggle"));
    }}>
      <Sidebar size={48} />
    </Button>
  )
}

export default function BaseLayout({ children, className }: ComponentProps<"main">) {
  const toggleEvent = useSignal(new EventTarget());
  
  return (
    <div
      className="relative h-full w-full flex"
    >
      <SidebarContext value={{ dialog: toggleEvent }}>
        <AppSidebar />
        <main className={`h-full w-full py-8 px-2 lg:py-6 lg:px-6 border-l border-l-zinc-400/50 shadow-2xl base-layout--main bg-neutral-200 dark:bg-neutral-800 ${className}`}>
          {children}
        </main>
      </SidebarContext>
    </div>
  )
}

export { useAppContext };