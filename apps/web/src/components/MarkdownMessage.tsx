import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

type CodeBlockProps = {
  children?: ReactNode;
  className?: string;
};

function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const code = String(children).replace(/\n$/, "");
  const language = className?.replace("language-", "").trim() || "code";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      console.error("Could not copy code");
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
        <span>{language}</span>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-gray-200"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre className="overflow-x-auto p-4 text-sm leading-6">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function looksLikeCode(value: string) {
  const codePatterns = [
    /^(def|class|import|from|const|let|var|function|public|private|if|for|while)\b/m,
    /:\s*$/m,
    /\breturn\b/,
    /\bprint\s*\(/,
    /\bconsole\.log\s*\(/,
    /[{};]/,
    /"""[\s\S]*"""/,
    /'''[\s\S]*'''/,
  ];

  return value.length > 80 && codePatterns.some((pattern) => pattern.test(value));
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown text-[15px] leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },

          code({ className, children, ...props }) {
            const text = String(children);
            const isFencedCode = Boolean(className?.includes("language-"));

            if (isFencedCode || looksLikeCode(text)) {
              return (
                <CodeBlock className={className || "language-python"}>
                  {children}
                </CodeBlock>
              );
            }

            return (
              <code
                {...props}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.9em]"
              >
                {children}
              </code>
            );
          },

          a({ children, ...props }) {
            return (
              <a
                {...props}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {children}
              </a>
            );
          },

          h1({ children }) {
            return <h1 className="mb-3 mt-6 text-2xl font-bold">{children}</h1>;
          },

          h2({ children }) {
            return <h2 className="mb-3 mt-5 text-xl font-bold">{children}</h2>;
          },

          h3({ children }) {
            return <h3 className="mb-2 mt-4 text-lg font-semibold">{children}</h3>;
          },

          p({ children }) {
            return <p className="mb-3 last:mb-0">{children}</p>;
          },

          ul({ children }) {
            return <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>;
          },

          ol({ children }) {
            return <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>;
          },

          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-4 pl-4 italic text-gray-600">
                {children}
              </blockquote>
            );
          },

          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  {children}
                </table>
              </div>
            );
          },

          th({ children }) {
            return (
              <th className="border bg-gray-50 px-3 py-2 text-left font-semibold">
                {children}
              </th>
            );
          },

          td({ children }) {
            return <td className="border px-3 py-2">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
