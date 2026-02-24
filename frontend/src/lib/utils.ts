import { clsx, type ClassValue } from "clsx"
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { twMerge } from "tailwind-merge"

export type ComponentProps<T> = T & Record<string, unknown> & {
  className?: string
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createContextWithHook<TContextProps>() {
  const context = createContext<TContextProps>({} as any);

  return {
    Provider: context.Provider,
    useHook: () => {
      const ctx = useContext(context);

      if (!ctx) {
        throw new Error('Invalid Context Hook.  No Context Found');
      }

      return ctx;
    }
  }
}