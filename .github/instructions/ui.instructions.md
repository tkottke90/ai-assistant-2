---
applyTo: 'frontend/**'
---

## General Guidelines

This frontend application uses **Preact** with **Signals** for state management, **TypeScript**, and **Tailwind CSS** for styling. Follow these principles when working with frontend code:

- Write testable, modular code—extract logic from components into pure functions
- Use Preact Signals (`useSignal`) for reactive state management
- Leverage shadcn/ui components from `@/components/ui/` for consistent UI
- Apply Tailwind utility classes for styling; include dark mode variants
- Type all props and state using TypeScript interfaces or types
- Handle errors gracefully with try-catch blocks and user-friendly messages
- Keep components focused on presentation; move business logic to utilities or hooks

## Component Design Patterns

### Avoid Nested Functions in Components

**Anti-pattern**: Do not define utility functions, event handlers, or data transformation functions inside component functions.

**Reason**: Nested functions cannot be unit tested independently without executing the entire component. This reduces testability and makes it difficult to test edge cases in isolation.

**Example of Anti-pattern**:
```tsx
export function AgentsPage() {
  const agents = useSignal<Agent[]>([]);
  
  // ❌ BAD: These functions are nested and untestable independently
  const paginatedAgents = () => {
    const start = (currentPage.value - 1) * itemsPerPage;
    return agents.value.slice(start, start + itemsPerPage);
  };

  const goToNextPage = () => {
    if (currentPage.value < totalPages.value) {
      currentPage.value += 1;
    }
  };

  return <div>{/* ... */}</div>;
}
```

**Correct approach**: Extract functions outside the component or into separate utility modules.

```tsx
// ✅ GOOD: Functions are testable independently
function paginateItems<T>(items: T[], page: number, itemsPerPage: number): T[] {
  const start = (page - 1) * itemsPerPage;
  return items.slice(start, start + itemsPerPage);
}

function canGoToNextPage(currentPage: number, totalPages: number): boolean {
  return currentPage < totalPages;
}

export function AgentsPage() {
  const agents = useSignal<Agent[]>([]);
  const currentPage = useSignal(1);
  
  const handleNextPage = () => {
    if (canGoToNextPage(currentPage.value, totalPages.value)) {
      currentPage.value += 1;
    }
  };

  return <div>{/* ... */}</div>;
}
```

**Exceptions**: Simple inline event handlers that only call other functions or set state are acceptable:
```tsx
// ✅ Acceptable: Simple inline handlers
<button onClick={() => setCount(count + 1)}>Increment</button>
<button onClick={() => deleteItem(id)}>Delete</button>
```

