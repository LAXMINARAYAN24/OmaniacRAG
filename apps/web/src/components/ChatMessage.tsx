import { Copy, RotateCcw, Check } from "lucide-react";
import { useState } from "react";
import type { Message } from "../types";
import { MarkdownMessage } from "./MarkdownMessage";
import { OmniGuardStatus } from "./OmniGuardStatus";

type Props = {
  message: Message;
  onRegenerate?: () => void;
  generating?: boolean;
};

export function ChatMessage({
  message,
  onRegenerate,
  generating = false
}: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl bg-gray-900 px-4 py-3 text-sm text-white"
            : "w-full max-w-[85%] text-sm text-gray-900"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <>
            <MarkdownMessage content={message.content} />

            {message.omniguard && (
              <OmniGuardStatus status={message.omniguard} />
            )}

            {!generating && message.content.trim() && (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyResponse}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-100"
                  title="Copy response"
                  aria-label="Copy response"
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy
                    </>
                  )}
                </button>

                {onRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-100"
                    title="Regenerate response"
                    aria-label="Regenerate response"
                  >
                    <RotateCcw size={14} />
                    Regenerate
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
