import { useHtmlElementListeners } from '@/lib/html-utils';
import type { Signal } from "@preact/signals";
import { X } from "lucide-preact";
import { cloneElement } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { Fragment, type JSX } from "preact/jsx-runtime";
import { openModal, type DialogProps } from "./dialog";
import { Button } from "./ui/button";
import { cn } from '@/lib/utils';

const portal = document.getElementById("dialogs") as HTMLElement;

const animationOptions: KeyframeAnimationOptions = {
  duration: 300,
  easing: 'ease-out',
};

const ANIMATIONS: Record<string, Keyframe[]> = {
  left: [
    { transform: 'translateX()' },
    { transform: 'translateX(-100%)', opacity: 0}
  ],
  right: [
    { transform: 'translateX()' },
    { transform: 'translateX(100%)', opacity: 0}
  ]
}

const DIRECTIONS = {
  left: "top-0 left-0 bottom-0 mr-auto -translate-x-full starting:open:-translate-x-full open:translate-x-0",
  right: "top-0 right-0 bottom-0 ml-auto translate-x-full starting:open:translate-x-full open:translate-x-0"
} as const;

type DIRECTIONS = keyof typeof DIRECTIONS;

interface DrawerProps extends DialogProps {
  direction?: keyof typeof DIRECTIONS;
  eventTrigger?: Signal<EventTarget>;
  showTrigger?: boolean;
}

export function Drawer({ className, children, trigger, title, onOpen, eventTrigger, direction, showTrigger = true }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  
  const triggerRef = useHtmlElementListeners(
    [
      [ 'click', () => openModal(dialogRef.current, onOpen) ]
    ],
    [ trigger ]
  );

  useEffect(() => {
    const abortController = new AbortController();

    if (!dialogRef.current) return;
    
    if (eventTrigger) {
      eventTrigger.value.addEventListener('toggle', () => {
        if (dialogRef.current?.open) {
          animateExit(dialogRef.current);
        } else {
          openModal(dialogRef.current, onOpen);
        }
      }, { signal: abortController.signal })
    }

    dialogRef.current.addEventListener('click', (event) => {
      const target = event.target as HTMLDialogElement;

      if (!target || !dialogRef.current) return;

      const rect = dialogRef.current.getBoundingClientRect();

      const outsideX = event.clientX < rect.left || event.clientX >= rect.right;
      const outsideY = event.clientY < rect.top || event.clientY >= rect.bottom;

      if (outsideX || outsideY) {
        animateExit(dialogRef.current, direction);
      }
    }, { signal: abortController.signal });

    return () => abortController.abort();
  }, [dialogRef, eventTrigger]);


  const triggerElement = cloneElement(
    trigger ?? (<button>Open</button>), { ref: triggerRef }
  );

  return (
    <Fragment>
      {showTrigger && triggerElement}
      {
        portal && createPortal(
          <dialog 
            class={`
            fixed block opacity-0
            starting:open:opacity-0 open:opacity-100
            ${DIRECTIONS[direction ?? "right"]}
            transition-discrete transition-transform duration-300 ease-out
            py-6 px-6 w-full h-screen md:w-3/4 xl:w-1/2 max-h-none m-0 focus-visible:outline-none shadow-2xl
            bg-neutral-100 dark:bg-neutral-700
            text-neutral-800 dark:text-neutral-200
            backdrop:bg-neutral-900/50 backdrop-blur-sm`}
            ref={dialogRef}
          >
            <div className="w-full h-full flex flex-col">
              <div className="flex justify-between">
                <h1 className="text-xl font-medium">{title}</h1>
                <Button variant="ghost" size="icon" onClick={() => { animateExit(dialogRef.current, direction) }}><X /></Button>
              </div>
              <div className={cn("grow overflow-hidden py-1", className)}>
                {children}
              </div>
            </div>
          </dialog>,
          portal
        )
      }
    </Fragment>
  );
}

function animateExit(dialog: HTMLDialogElement | null, dir: DIRECTIONS = "right") {
  if (!dialog) return;

  const animation = dialog.animate(
    ANIMATIONS[dir],
    animationOptions
  );
  
  animation.onfinish = () => {
    dialog.close();
  };
}