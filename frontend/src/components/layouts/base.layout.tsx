import { Fragment } from "preact/jsx-runtime";
import { Button } from "../ui/button";
import { Sidebar } from "lucide-preact";
import { createContextWithHook } from "@/lib/utils";
import { useEffect, useRef } from "preact/hooks";
import { Signal, useSignal } from "@preact/signals";
import { type ComponentProps } from "preact/compat";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { Drawer } from "../drawer";
import { ThreadList } from "../thread-list";

const slideIn: Keyframe[] = [
  { transform: "translateX(-100%)", opacity: 0 },
  { transform: "translateX(0) !important" }
]

const slideOutKeyframes: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-100%)', opacity: 0}
];

const animationOptions: KeyframeAnimationOptions = {
  duration: 300,
  easing: 'ease-out',
};

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
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const abortController = new AbortController();

    if (!dialogRef.current) return;

    // Register the dialog listener
    dialog.value.addEventListener("toggle", () => {
      
      if (!dialogRef.current) return;

      // When the dialog is open, we close it
      if (dialogRef.current.open) {
        const animation = dialogRef.current.animate(slideOutKeyframes, animationOptions);
        
        animation.addEventListener("finish", () => {
          dialogRef?.current?.close();
        });
        
      } else { // When the dialog is closed, we open it
        dialogRef.current.showModal();

        dialogRef.current.animate(slideIn, animationOptions);
      }
    }, { signal: abortController.signal })

    dialogRef.current.addEventListener('cancel', async (event) => {
      event.preventDefault();
      dialog.value.dispatchEvent(new CustomEvent("toggle"));
    }, { signal: abortController.signal });

    dialogRef.current.addEventListener('click', (event) => {
      const target = event.target as HTMLDialogElement;

      if (!target) return;

      const rect = target.getBoundingClientRect();
      const minX = rect.left + target.clientLeft;
      var minY = rect.top + target.clientTop;
      if ((event.clientX < minX || event.clientX >= minX + target.clientWidth) ||
          (event.clientY < minY || event.clientY >= minY + target.clientHeight)) {
        target.close();
      }
    }, { signal: abortController.signal });

    return () => abortController.abort();
  }, [dialogRef, dialog]);

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
        isMobile &&
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

  // We return null in the following cases:
  // 1. If there is no dialog reference available.
  // 2. If the user is not on a mobile device, since the sidebar is always visible on larger screens.
  if (!dialog || !dialog.value || !isMobile.value) return null;

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