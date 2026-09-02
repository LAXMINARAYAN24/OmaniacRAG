import { useEffect, useRef, useState } from "react";
import { Menu, Trash2, Shield } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatMessage } from "./components/ChatMessage";
import { Composer } from "./components/Composer";
import { SettingsModal } from "./components/SettingsModal";
import { streamMessage, queryOmniGuard } from "./lib/api";
import type { Chat, Message, Settings } from "./types";

function uid() {
  return crypto.randomUUID();
}

const defaults: Settings = {
  provider: "ollama",
  model: "llama3.2",
  backendUrl: "http://localhost:3000",
  mode: "direct",
  omniguardUrl: "http://localhost:8000"
};

function createChat(): Chat {
  const now = Date.now();

  return {
    id: uid(),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

function loadChats(): Chat[] {
  try {
    const saved = localStorage.getItem("chats");

    if (saved) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    const oldMessages = localStorage.getItem("messages");

    if (oldMessages) {
      const messages = JSON.parse(oldMessages);

      if (Array.isArray(messages) && messages.length > 0) {
        const now = Date.now();

        return [{
          id: uid(),
          title: "Previous chat",
          messages,
          createdAt: now,
          updatedAt: now
        }];
      }
    }
  } catch {
    // Ignore invalid local storage.
  }

  return [createChat()];
}

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem("settings");

    if (saved) {
      const parsed = JSON.parse(saved);

      // Migration: if provider was previously saved as "omniguard", convert to ollama + mode: omniguard
      if (parsed.provider === "omniguard") {
        parsed.provider = "ollama";
        parsed.mode = "omniguard";
      }

      return {
        ...defaults,
        ...parsed,
        mode: parsed.mode || "direct",
        omniguardUrl: parsed.omniguardUrl || defaults.omniguardUrl
      };
    }
  } catch {
    // Ignore invalid settings.
  }

  return defaults;
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeChatId, setActiveChatId] = useState("");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [loading, setLoading] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chats.length > 0 && !activeChatId) {
      setActiveChatId(chats[0].id);
    }
  }, [chats, activeChatId]);

  useEffect(() => {
    localStorage.setItem("chats", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    end.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth"
    });
  }, [chats, activeChatId, loading]);

  const activeChat =
    chats.find((chat) => chat.id === activeChatId) ?? chats[0];

  if (!activeChat) {
    return null;
  }

  const messages: Message[] = activeChat.messages;

  function updateChat(
    chatId: string,
    updater: (chat: Chat) => Chat
  ) {
    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId ? updater(chat) : chat
      )
    );
  }

  function newChat() {
    const chat = createChat();

    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setSidebar(false);
  }

  function deleteChat(chatId?: string) {
    const targetId = chatId ?? activeChatId;

    setChats((current) => {
      const remaining = current.filter(
        (chat) => chat.id !== targetId
      );

      if (remaining.length > 0) {
        if (targetId === activeChatId) {
          setActiveChatId(remaining[0].id);
        }

        return remaining;
      }

      const fresh = createChat();
      setActiveChatId(fresh.id);

      return [fresh];
    });
  }

  function renameChat(chatId: string, title: string) {
    updateChat(chatId, (chat) => ({
      ...chat,
      title,
      updatedAt: Date.now()
    }));
  }

  async function send(text: string) {
    if (loading) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: Message = {
      id: uid(),
      role: "user",
      content: text
    };

    const assistantId = uid();

    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: ""
    };

    const history = [...activeChat.messages, userMessage];

    updateChat(activeChat.id, (chat) => ({
      ...chat,
      title:
        chat.title === "New chat"
          ? text.slice(0, 40) || "New chat"
          : chat.title,
      messages: [...history, assistantMessage],
      updatedAt: Date.now()
    }));

    setLoading(true);

    try {
      if (settings.mode === "omniguard") {
        const result = await queryOmniGuard(
          settings,
          history,
          controller.signal
        );

        updateChat(activeChat.id, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: result.answer,
                  omniguard: result.status
                }
              : message
          ),
          updatedAt: Date.now()
        }));
      } else {
        await streamMessage(
          settings,
          history,
          (token) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: message.content + token
                    }
                  : message
              ),
              updatedAt: Date.now()
            }));
          },
          controller.signal
        );
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong.";

      updateChat(activeChat.id, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  message.content ||
                  `Sorry, I couldn't complete that request.\n\nError: ${errorMessage}`
              }
            : message
        ),
        updatedAt: Date.now()
      }));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function regenerate(messageId: string) {
    if (loading) return;

    const assistantIndex = activeChat.messages.findIndex(
      (message) => message.id === messageId
    );

    if (assistantIndex <= 0) return;

    const userIndex = assistantIndex - 1;
    const userMessage = activeChat.messages[userIndex];

    if (userMessage.role !== "user") return;

    const history = activeChat.messages.slice(0, userIndex);
    const controller = new AbortController();

    abortRef.current = controller;
    setLoading(true);

    updateChat(activeChat.id, (chat) => ({
      ...chat,
      messages: chat.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: ""
            }
          : message
      ),
      updatedAt: Date.now()
    }));

    try {
      if (settings.mode === "omniguard") {
        const result = await queryOmniGuard(
          settings,
          [...history, userMessage],
          controller.signal
        );

        updateChat(activeChat.id, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: result.answer,
                  omniguard: result.status
                }
              : message
          ),
          updatedAt: Date.now()
        }));
      } else {
        await streamMessage(
          settings,
          [...history, userMessage],
          (token) => {
            updateChat(activeChat.id, (chat) => ({
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      content: message.content + token
                    }
                  : message
              ),
              updatedAt: Date.now()
            }));
          },
          controller.signal
        );
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong.";

      updateChat(activeChat.id, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content:
                  message.content ||
                  `Sorry, I couldn't regenerate that response.\n\nError: ${errorMessage}`
              }
            : message
        ),
        updatedAt: Date.now()
      }));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  useEffect(() => {
    if (loading || queuedMessages.length === 0) return;

    const nextMessage = queuedMessages[0];

    setQueuedMessages((current) => current.slice(1));

    void send(nextMessage);
  }, [loading, queuedMessages]);

  function stopGenerating() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900">
      <Sidebar
        chats={chats}
        activeChatId={activeChat.id}
        onSelect={(id) => {
          setActiveChatId(id);
          setSidebar(false);
        }}
        onNew={newChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onSettings={() => setModal(true)}
        open={sidebar}
        onClose={() => setSidebar(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebar(true)}
              className="rounded-lg p-2 hover:bg-gray-100 md:hidden"
              aria-label="Open sidebar"
            >
              <Menu size={19} />
            </button>

            <div>
              <div className="text-sm font-semibold">
                {activeChat.title}
              </div>

              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>
                  {settings.provider === "ollama" ? "Ollama" : "Hugging Face"} • {settings.model}
                </span>
                {settings.mode === "omniguard" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200/80">
                    <Shield size={10} className="text-emerald-600" />
                    OmniGuard Active
                  </span>
                )}
                {loading ? " • Generating..." : ""}
              </div>
            </div>
          </div>

          <button
            onClick={() => deleteChat()}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600"
            title="Delete current chat"
            aria-label="Delete current chat"
          >
            <Trash2 size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gray-900 text-2xl text-white">
                  ✦
                </div>

                <h1 className="mt-5 text-2xl font-semibold">
                  How can I help?
                </h1>

                <p className="mt-2 max-w-md text-sm text-gray-500">
                  Ask your local AI anything. Your conversations stay
                  on your machine.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {[
                    "Explain something simply",
                    "Write Python code",
                    "Help me debug",
                    "Summarize this"
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => send(suggestion)}
                      disabled={loading}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onRegenerate={
                      message.role === "assistant"
                        ? () => regenerate(message.id)
                        : undefined
                    }
                    generating={loading}
                  />
                ))}

                <div ref={end} />
              </div>
            )}
          </div>
        </div>

        {queuedMessages.length > 0 && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center justify-between px-4 text-xs text-gray-500">
            <span>
              {queuedMessages.length} message
              {queuedMessages.length === 1 ? "" : "s"} queued
            </span>

            <button
              type="button"
              onClick={() => setQueuedMessages([])}
              className="text-gray-400 hover:text-gray-700"
            >
              Clear queue
            </button>
          </div>
        )}

        <Composer
          onSend={send}
          onStop={stopGenerating}
          disabled={false}
          generating={loading}
        />
      </main>

      {modal && (
        <SettingsModal
          settings={settings}
          onChange={(next) => {
            setSettings(next);
            setModal(false);
          }}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  );
}

