import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso';
import { Toaster } from 'sonner';
import { ChatPage } from './routes/chat/index.tsx';
import { AgentsPage } from './routes/agents/index.tsx';
import { ArchivePage } from './routes/archive/index.tsx';
import { useCallback } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { AppContextProvider } from './app-context.tsx';
import { EvaluationsPage } from './routes/evaluations/index.tsx';
import { EvaluationDetailsPage } from './routes/evaluations/details/index.tsx';

function NotFound() {
  return (
    <div>
      <h1>404 - Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}

function App() {
  const threads = useSignal([]);
  const router = useSignal(new EventTarget());

  const onRouteChange = useCallback((newLocation: string) => {
    router.value.dispatchEvent(new CustomEvent('route-updated', { detail: newLocation }));
  }, []);

  return (
    <LocationProvider>
      <ErrorBoundary>
        <main class="w-full h-full">
          <AppContextProvider value={{
            threads,
            routeUpdate: router.value,
          }}>
            <Router onRouteChange={onRouteChange}>
              <Route path="/" component={ChatPage} />
              <Route path="/chat" component={ChatPage} />
              <Route path="/chat/:threadId" component={ChatPage} />
              <Route path="/agents" component={AgentsPage} />
              <Route path="/archive" component={ArchivePage} />
              <Route path="/evaluations" component={EvaluationsPage} />
              <Route path="/evaluations/:evaluationId" component={EvaluationDetailsPage} />
              <Route path="*" component={NotFound} />
            </Router>
          </AppContextProvider>
        </main>
        <Toaster position="bottom-right" richColors />
      </ErrorBoundary>
    </LocationProvider>
  );
}

export default App;