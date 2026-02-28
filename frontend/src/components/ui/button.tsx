import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import * as Preact from 'preact';
import { cn } from "@/lib/utils"
import { Signal, useSignal } from "@preact/signals"
import { Spinner } from "./spinner";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        constructive:
          "bg-green-600 text-white hover:bg-green-600/90 focus-visible:ring-green-600/50 dark:focus-visible:ring-green-600/40 dark:bg-green-500/60 active:bg-green-500/50",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 active:bg-destructive/70",
        warning:
          "bg-amber-500 text-white hover:bg-amber-500/90 focus-visible:ring-amber-500/50 dark:focus-visible:ring-amber-500/40 dark:bg-amber-500/60 active:bg-amber-500/50",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 hover:text-accent-foreground/80",
        link: "text-primary underline-offset-4 hover:underline",
        iconDestructive: "text-red-600 hover:text-red-800 active:bg-red-500/50 dark:text-red-400 dark:hover:text-red-300 dark:active:bg-red-500/50",
        iconWarning: "text-amber-600 hover:text-amber-800 active:bg-amber-500/50 dark:text-amber-400 dark:hover:text-amber-300 dark:active:bg-amber-500/50",
        iconDefault: "text-neutral-300/50 hover:text-neutral-300 active:bg-neutral-500/50 focus-visible:ring-primary/50 dark:focus-visible:ring-primary/40 dark:active:bg-neutral-500/50",
        iconInfo: "text-blue-600 hover:text-blue-800 active:bg-blue-500/50 dark:text-blue-400 dark:hover:text-blue-300 dark:active:bg-blue-500/50",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type iButtonProps = Preact.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: iButtonProps) {
  const Comp = (asChild ? Slot.Root : "button") as any

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn('cursor-pointer', buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

interface iConfirmButtonProps extends iButtonProps {
  onConfirm: () => void;
  timeout?: number
}

/**
 * 2 Stage Button Press to Confirm Destructive Actions
 * @param param0 
 */
function ConfirmButton({ children, onConfirm, timeout, ...props }: iConfirmButtonProps) {
  const pendingConfirm = useSignal(false);
  const timeoutRef = useSignal<number | null>(null);

  const handleClick = () => {
    if (pendingConfirm.value) {
      // If already pending confirmation, execute the action
      onConfirm();
      pendingConfirm.value = false;
      if (timeoutRef.value) {
        clearTimeout(timeoutRef.value);
        timeoutRef.value = null;
      }
    } else {
      // Otherwise, set to pending confirmation
      pendingConfirm.value = true;
      timeoutRef.value = window.setTimeout(() => {
        pendingConfirm.value = false;
        timeoutRef.value = null;
      }, timeout || 3000); // Default timeout of 3 seconds
    }
  }

  return (
    <Button
      {...props}
      data-confirm={pendingConfirm.value}
      className="group"
      variant={pendingConfirm.value ? "iconWarning" : "iconDestructive"} onClick={handleClick}
    >
      {children}
    </Button>
  )
}

interface LoadingButtonProps extends iButtonProps {
  loading: Signal<boolean>;
}

function LoadingButton({ children, loading, ...props }: LoadingButtonProps) {

  return (
    <Button
      className="group transition-all duration-300 ease-in-out overflow-hidden"
      data-loading={loading.value}
      disabled={loading.value}
      {...props}
    >
      { loading.value && <Spinner />}
      <span>{children}</span>
    </Button>
  )
}

export { Button, ConfirmButton, LoadingButton, buttonVariants }
