import {
  MessageSquarePlus,
  Settings,
  PanelLeftClose,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search
} from "lucide-react";
import { useState } from "react";
import type { Chat } from "../types";

type Props = {
  chats: Chat[];
  activeChatId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id?: string) => void;
  onRename: (id: string, title: string) => void;
  onSettings: () => void;
  open: boolean;
  onClose: () => void;
};

function getGroup(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Older";
}

export function Sidebar({
  chats,
  activeChatId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSettings,
  open,
  onClose
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function startRename(chat: Chat) {
    setEditingId(chat.id);
    setEditTitle(chat.title);
    setMenuId(null);
  }

  function saveRename() {
    if (!editingId) return;

    const title = editTitle.trim();

    if (title) {
      onRename(editingId, title);
    }

    setEditingId(null);
    setEditTitle("");
  }

  function confirmDelete() {
    if (!deleteId) return;

    onDelete(deleteId);
    setDeleteId(null);
  }

  const filteredChats = chats
    .filter((chat) =>
      chat.title.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const groups = {
    Today: filteredChats.filter((chat) => getGroup(chat.updatedAt) === "Today"),
    Yesterday: filteredChats.filter(
      (chat) => getGroup(chat.updatedAt) === "Yesterday"
    ),
    Older: filteredChats.filter((chat) => getGroup(chat.updatedAt) === "Older")
  };

  function renderChats(items: Chat[]) {
    return (
      <div className="space-y-1">
        {items.map((chat) => (
          <div
            key={chat.id}
            onClick={(event) => event.stopPropagation()}
            className={`group relative flex items-center rounded-lg ${
              chat.id === activeChatId
                ? "bg-gray-200"
                : "hover:bg-gray-200"
            }`}
          >
            {editingId === chat.id ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                onBlur={saveRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    saveRename();
                  }

                  if (event.key === "Escape") {
                    setEditingId(null);
                    setEditTitle("");
                  }
                }}
                className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-sm outline-none ring-1 ring-gray-300"
              />
            ) : (
              <>
                <button
                  onClick={() => onSelect(chat.id)}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
                  title={chat.title}
                >
                  {chat.title}
                </button>

                <button
                  onClick={() =>
                    setMenuId(menuId === chat.id ? null : chat.id)
                  }
                  className="mr-1 rounded-md p-1.5 text-gray-500 opacity-0 hover:bg-gray-300 group-hover:opacity-100"
                  title="Chat options"
                  aria-label="Chat options"
                >
                  <MoreHorizontal size={16} />
                </button>

                {menuId === chat.id && (
                  <div className="absolute right-1 top-9 z-30 w-36 overflow-hidden rounded-lg border bg-white py-1 shadow-lg">
                    <button
                      onClick={() => startRename(chat)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      <Pencil size={14} />
                      Rename
                    </button>

                    <button
                      onClick={() => {
                        setMenuId(null);
                        setDeleteId(chat.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <aside
        onClick={() => setMenuId(null)}
        className={`fixed md:static z-20 h-full w-[270px] shrink-0 border-r bg-[#f7f7f8] p-3 flex flex-col transition-transform ${
          open
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-2 py-3 font-bold">
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gray-900 text-white">
              ✦
            </span>
            Local AI
          </span>

          <button
            className="md:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <PanelLeftClose size={19} />
          </button>
        </div>

        <button
          onClick={onNew}
          className="mt-2 flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm hover:bg-gray-50"
        >
          <MessageSquarePlus size={17} />
          New chat
        </button>

        <div className="relative mt-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">
              No chats found
            </div>
          ) : (
            <>
              {groups.Today.length > 0 && (
                <section className="mb-4">
                  <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Today
                  </div>
                  {renderChats(groups.Today)}
                </section>
              )}

              {groups.Yesterday.length > 0 && (
                <section className="mb-4">
                  <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Yesterday
                  </div>
                  {renderChats(groups.Yesterday)}
                </section>
              )}

              {groups.Older.length > 0 && (
                <section>
                  <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Older
                  </div>
                  {renderChats(groups.Older)}
                </section>
              )}
            </>
          )}
        </div>

        <button
          onClick={onSettings}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-200"
        >
          <Settings size={17} />
          Settings
        </button>

        <div className="px-3 py-2 text-xs text-gray-500">
          ● Local model
        </div>
      </aside>

      {deleteId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Delete this chat?
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
