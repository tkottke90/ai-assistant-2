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

  state.currentChat = result.threadId;
  state.chats.set(result.threadId, { title: '', exp: exp.toISOString() });

  updateState(state);

  return state;
}

async function loadCurrentThread() {
  const state = loadState();

  if (state.currentChat) {
    return state.currentChat
  }

  await newChatThread();

  return loadState().currentChat;
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
  loadCurrentThread,
  getChatHistory: getThreadHistory,
}