import { ArrowUp, Square } from "lucide-react";
import { useState } from "react";

type Props = {
  onSend: (text: string) => void;
  onStop: () => void;
  disabled?: boolean;
  generating?: boolean;
};

export function Composer({
  onSend,
  onStop,
  disabled = false,
  generating = false
}: Props) {
  const [text, setText] = useState("");

  function submit() {
    const value = text.trim();

    if (!value || disabled) return;

    onSend(value);
    setText("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="flex items-end gap-2 rounded-2xl border bg-white p-2 shadow-sm">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={
            generating
              ? "Type your next command..."
              : "Message Local AI..."
          }
          rows={1}
          className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        {generating ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !text.trim()}
              className="flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              title="Queue message"
              aria-label="Queue message"
            >
              <ArrowUp size={15} />
              Queue
            </button>

            <button
              type="button"
              onClick={onStop}
              className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <Square size={15} fill="currentColor" />
              Stop
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-900 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Send message"
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>

      <div className="mt-2 text-center text-xs text-gray-400">
        {generating
          ? "Your next message will be sent automatically when this response finishes."
          : "Local AI can make mistakes. Check important information."}
      </div>
    </div>
  );
}
