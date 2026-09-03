import type { ChatMessage, LLMProvider } from "../types.js";

const SYSTEM_PROMPT = `You are a helpful AI assistant.

Always format your responses using Markdown.

When providing programming code:
- Always use fenced Markdown code blocks with triple backticks.
- Always specify the programming language, for example \`\`\`python.
- Never put multi-line code inside single backticks.
- Keep code properly formatted and readable.

Use headings, bullet points, numbered lists, tables, and inline code when they improve readability.`;

export class OllamaProvider implements LLMProvider {
  constructor(private baseUrl: string) {}

  async chat(message: string, history: ChatMessage[], model: string) {
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: message }
        ],
        stream: false
      })
    });

    if (!r.ok) {
      throw new Error(`Ollama error: ${r.status} ${await r.text()}`);
    }

    const d = await r.json() as { message?: { content?: string } };

    return d.message?.content || "No response returned.";
  }

  async stream(
    message: string,
    history: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ) {
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: message }
        ],
        stream: true
      })
    });

    if (!r.ok || !r.body) {
      throw new Error(`Ollama error: ${r.status} ${await r.text()}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const data = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            error?: string;
          };

          if (data.error) throw new Error(data.error);

          const token = data.message?.content;

          if (token) {
            onToken(token);
          }

          if (data.done) {
            return;
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        const data = JSON.parse(buffer) as {
          message?: { content?: string };
        };

        if (data.message?.content) {
          onToken(data.message.content);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
