import { useHtmlElementListeners } from '@/lib/html-utils';
import type { BaseProps } from '@/lib/utility-types';
import { cn, createContextWithHook } from '@/lib/utils';
import { Signal, useSignal } from '@preact/signals';
import { X as XIcon } from 'lucide-preact';
import { cloneElement, type JSX } from "preact";
import { useRef } from 'preact/hooks';
import { buttonVariants } from './ui/button';

const X = XIcon as any;

export interface DialogProps extends BaseProps {
  title?: string;
  trigger?: JSX.Element,
  disableClose?: boolean,
  open?: Signal<Boolean>,
  onClose?: () => void,
  onCancel?: () => void,
  onOpen?: () => void,
}

interface iDalogContext {
  dialog: HTMLDialogElement | null;
  close: (value?: string) => void;
  value: string | undefined;
}

const DialogContext = createContextWithHook<iDalogContext>()

export const useDialog = DialogContext.useHook;

export function Dialog({ className, children, trigger, disableClose, title, onCancel, onClose, onOpen }: DialogProps) {
  const modalValue = useSignal<string | undefined>();
  const modalRef = useRef<HTMLDialogElement>(null)

  const triggerRef = useHtmlElementListeners(
    [
      [ 'click', () => openModal(modalRef.current, onOpen) ]
    ],
    [ trigger ]
  );

  const triggerElement = cloneElement(
    trigger ?? (<button>Open</button>), { ref: triggerRef }
  );

  return (
    <DialogContext.Provider value={{
      dialog: modalRef.current,
      value: modalValue.value,
      close: (value?: string) => {
        if (onClose) {
          onClose()
        }

        closeModal(modalRef.current, value)
      }
    }}>
      { triggerElement }
      <dialog
        ref={modalRef}
        className={
          className ?? `p-6 text-neutral-800 dark:text-neutral-200
        bg-neutral-50/80 dark:bg-neutral-700/80
        rounded border-neutral-400/50 backdrop:bg-neutral-900/50 backdrop-blur-sm
        absolute block pointer-events-none opacity-0 mx-auto my-4 translate-y-1 min-w-10/12
        sm:min-w-150
        backdrop:backdrop-blur-xs
        open:translate-y-0 open:pointer-events-auto open:opacity-100 z-50`}
      >
        <div className="flex">
          <h2 className="grow">{title}</h2>
          { !disableClose && <button className={cn(buttonVariants({ variant: 'ghost', size: 'icon', className: '' }))} onClick={() => {cancelModal(modalRef.current, onCancel)}}><X /></button> }
        </div>
        <br />
        { children }
      </dialog>
    </DialogContext.Provider>
  );
}

type ModalRef = HTMLDialogElement | null;

export function openModal(modal: ModalRef, onOpen?: (() => void)) {
  if (modal) {
    if (onOpen) {
      onOpen();
    }

    modal.showModal();
  }
}

export function closeModal(modal: ModalRef, value?: string) {
  if (modal) {
    modal.close(value);
  }
}

export function cancelModal(modal: ModalRef, onCancel?: (() => void)) {
  if (onCancel) {
    onCancel();
  }
  
  closeModal(modal);
}