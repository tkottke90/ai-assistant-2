import { Fragment } from "preact/jsx-runtime";
import { Button } from "../ui/button";
import { Sidebar } from "lucide-preact";
import { createContextWithHook } from "@/lib/utils";
import { useEffect, useRef } from "preact/hooks";
import { Signal, useSignal } from "@preact/signals";
import { createPortal, type ComponentProps } from "preact/compat";
import { useIsMobile } from "@/hooks/use-is-mobile";

const portal = document.getElementById("dialogs") as HTMLElement;

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
  dialog: Signal<EventTarget>
}>()

function SidebarContents() {

  return (
    <Fragment>
      <header>
        <h1 className="text-2xl font-bold mb-4 text-center">Assistant</h1>
      </header>
    </Fragment>
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
        <SidebarContents />
      </aside>
      {
        portal && isMobile && createPortal(
          <dialog 
            class=" p-8 border-r fixed h-screen min-w-3/4 max-w-10/12 top-0 left-0 bottom-0 max-h-none m-0 focus-visible:outline-none shadow-2xl
            base-layout--aside
            bg-neutral-50/80 dark:bg-neutral-700/80
            border-neutral-400/50 backdrop:bg-neutral-900/50 backdrop-blur-sm" 
            ref={dialogRef}
          >
            <SidebarContents />
          </dialog>,
          portal
        )
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
  if (!dialog.value || !isMobile.value) return null;

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