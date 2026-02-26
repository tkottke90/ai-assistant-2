import { render } from 'preact'
import './index.css'
import App from './app.tsx'
import ChatHistory from './routes/chat/chat-history';

ChatHistory.initialize();

render(<App />, document.getElementById('app')!)
