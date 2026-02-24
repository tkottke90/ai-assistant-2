import { ErrorBoundary, LocationProvider, Route, Router } from 'preact-iso';
import { Toaster } from 'sonner';
import { ChatPage } from './routes/chat/index.tsx';
import { AgentsPage } from './routes/agents/index.tsx';

function NotFound() {
  return (
    <div>
      <h1>404 - Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}

function App() {

  return (
    <LocationProvider>
      <ErrorBoundary>
        <main class="w-full h-full">
          <Router>
            <Route path="/" component={ChatPage} />
            <Route path="/agents" component={AgentsPage} />
            <Route path="*" component={NotFound} />
          </Router>
        </main>
        <Toaster position="bottom-right" richColors />
      </ErrorBoundary>
    </LocationProvider>
  );
}

export default App;