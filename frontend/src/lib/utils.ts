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

const MISSING = Symbol('context-missing');

export function createContextWithHook<TContextProps>() {
  const context = createContext<TContextProps | typeof MISSING>(MISSING);

  return {
    Provider: context.Provider as import('preact').Context<TContextProps>['Provider'],
    useHook: () => {
      const ctx = useContext(context);

      if (ctx === MISSING) {
        throw new Error('Invalid Context Hook.  No Context Found');
      }

      return ctx as TContextProps;
    }
  }
}