import {
  newThread,
  getThreadHistory
} from "@tkottke90/ai-assistant-client";

interface ChatRegistryItem {
  exp: string;
  title: string;
}

interface ChatConfig {
  currentChat: string;
  chats: Map<string, ChatRegistryItem>;
}

const CHAT_STORAGE_KEY = 'chat_messages';

function initialize() {
  const config = loadState();

  if (!config) {
    updateState({
      currentChat: '',
      chats: new Map(),
    });
  }
}

async function newChatThread() {
  const state = loadState();
  const result = await newThread();

  const exp = new Date();
  exp.setDate(exp.getDate() + 7);

  state.currentChat = result.thread_id;
  state.chats.set(result.thread_id, { title: '', exp: exp.toISOString() });

  updateState(state);

  return result.thread_id;
}

/**
 * Create a new thread and return its ID. The URL is now the
 * source of truth for which thread is active.
 */
async function loadOrCreateThread() {
  return newChatThread();
}

function loadState() {
  const config = localStorage.getItem(CHAT_STORAGE_KEY);

  if (config) {
    const c = JSON.parse(config) as ChatConfig;

    return {
      ...c,
      chats: new Map(Object.entries(c.chats)),
    }
  }

  return {
    currentChat: '',
    chats: new Map(),
  } as ChatConfig;
}

function updateState(config: ChatConfig) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(config));
}

export default {
  initialize,
  newChatThread,
  loadOrCreateThread,
  getChatHistory: getThreadHistory,
}