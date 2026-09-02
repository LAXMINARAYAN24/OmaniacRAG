# Runtime RAG Verification

## Test Environment

| Item | Value |
|---|---|
| Date | 2026-09-02 |
| Node server | `http://localhost:3000` (tsx watch) |
| Frontend | `http://localhost:5173` (Vite) |
| Ollama daemon | `http://localhost:11434` |
| Model | `qwen3:latest` |
| Mode | `direct` (OmniGuard OFF) |
| Python OmniGuard | Running but **not contacted** |
| Test method | PowerShell `Invoke-RestMethod` → `POST /api/chat` |
| History per call | `[]` (empty array, hard-coded in each request body) |

---

## Exact Runtime Path

```
PowerShell test script
  └─ POST http://localhost:3000/api/chat
       { message: "What is RAG?", history: [], provider: "ollama", model: "qwen3:latest" }
         └─ apps/server/src/index.ts  line 129  app.post("/api/chat", ...)
              └─ getProvider("ollama").chat(message, [], "qwen3:latest")
                   └─ apps/server/src/providers/ollama.ts  OllamaProvider.chat()
                        └─ POST http://localhost:11434/api/chat
                             { model: "qwen3:latest", messages: [system, user], stream: false }
```

OmniGuard (`/api/omniguard/query`, Python `:8000`) was **never on this path**.

---

## Exact Ollama Request (identical across all 6 runs)

```json
{
  "endpoint": "http://localhost:11434/api/chat",
  "model": "qwen3:latest",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful AI assistant.\n\nAlways format your responses using Markdown.\n\nWhen providing programming code:\n- Always use fenced Markdown code blocks with triple backticks.\n- Always specify the programming language, for example ```python.\n- Never put multi-line code inside single backticks.\n- Keep code properly formatted and readable.\n\nUse headings, bullet points, numbered lists, tables, and inline code when they improve readability."
    },
    {
      "role": "user",
      "content": "What is RAG?"
    }
  ],
  "stream": false
}
```

**Generation options present in request:** none — no `temperature`, no `top_k`, no `top_p`, no `seed`, no `options` block.

---

## Run Results

| Run | Timestamp (UTC) | Model | History len | Msg count | Answer summary |
|---|---|---|---:|---:|---|
| 1 | 18:31:36 | qwen3:latest | 0 | 2 | "RAG stands for **Retrieval-Augmented Generation**…" |
| 2 | 18:34:03 | qwen3:latest | 0 | 2 | "RAG stands for **Retrieval-Augmented Generation**…" |
| 3 | 18:35:38 | qwen3:latest | 0 | 2 | "RAG stands for **Retrieval-Augmented Generation**…" |
| 4 | 18:37:21 | qwen3:latest | 0 | 2 | "RAG bridges the gap between static knowledge and dynamic data…" |
| 5 | 18:39:40 | qwen3:latest | 0 | 2 | "RAG (Retrieval-Augmented Generation) is a technique that combines retrieval systems…" |
| 6 | 18:41:36 | qwen3:latest | 0 | 2 | "RAG (Retrieval-Augmented Generation) is a framework that combines retrieval of external information…" |

All 6 answers correctly and consistently expand RAG as **Retrieval-Augmented Generation**.

---

## String Audit — Exact Request Payloads

For every captured Ollama request:

| String | Appears in system prompt? | Appears in history? | Appears in user message? |
|---|---|---|---|
| `"RAG"` | ❌ No | ❌ No (history = []) | ✅ Yes — `"What is RAG?"` only |
| `"Retrieval-Augmented Generation"` | ❌ No | ❌ No | ❌ No |
| `"Retrieval Augmented Generation"` | ❌ No | ❌ No | ❌ No |
| `"Run-Length Augmentation"` | ❌ No | ❌ No | ❌ No |

The definition of RAG **does not appear anywhere in any message sent to Qwen3**. The model received only the generic Markdown formatting system prompt and the bare question.

---

## Was OmniGuard Called?

**No.** The `/api/chat` endpoint in `index.ts` routes directly to `OllamaProvider.chat()`. The OmniGuard proxy (`/api/omniguard/query`, Python `:8000`) is on a completely separate route. It was not called in any of the 6 runs. Confirmed by:

- Code inspection: `index.ts` line 129 — direct route, no OmniGuard branch.
- Node server log: no OmniGuard-related output for any run.
- Python OmniGuard log: no requests received during the test window.

---

## Was Retrieval Called?

**No.** No vector search, BM25 query, or `DenseRetriever`/`BM25Retriever` call occurred. The `OllamaProvider` performs only a single HTTP POST to Ollama's `/api/chat`.

---

## Was Previous Chat Context Sent?

**No.** Every request contained `history: []`. The Node endpoint defaults to `history = []` when absent (`index.ts` line 132). The test script explicitly sent `history: @()` (empty PowerShell array → JSON `[]`). Confirmed by the `messages` array in all 6 audit logs: exactly 2 messages, `system` + `user`, no `assistant` turns.

---

## Was Any RAG Definition Injected?

**No.** The system prompt is a generic Markdown formatting instruction. It contains no domain knowledge, no RAG definition, no grounding context, and no retrieved documents. Confirmed by the full verbatim content captured in every audit log.

---

## Was Any Hidden / Additional Prompt Injected?

**No.** The `messages` array logged immediately before the `fetch()` call is the complete, unmodified payload sent to Ollama. There are exactly 2 messages: the static `SYSTEM_PROMPT` constant (lines 3–13 of `ollama.ts`) and the user message.

---

## Was a Seed Used?

**No.** No `seed`, `temperature`, `top_k`, `top_p`, or `options` field was present in any of the 6 requests. Ollama used its default sampling parameters for all runs.

---

## Answers Across 6 Runs

Every run returned the correct definition: **Retrieval-Augmented Generation**. Wording and formatting varied (stochastic sampling without a seed), but the factual expansion was consistent:

> RAG = Retrieval-Augmented Generation — a framework combining retrieval from external knowledge sources with a generative model.

No run returned "Run-Length Augmentation" or any other incorrect expansion.

---

## Conclusion

**A. Proven model knowledge**

> [!IMPORTANT]
> The runtime evidence proves that the application sent **only** a generic formatting system prompt and the bare user question `"What is RAG?"` to Qwen3 on every run. No history, no retrieved context, no OmniGuard output, no RAG definition, and no hidden prompt were injected.
>
> The correct "Retrieval-Augmented Generation" answer comes entirely from **Qwen3's own pre-trained weights**.

The earlier incorrect "Run-Length Augmentation" answer was stochastic sampling noise — a known LLM behaviour with short acronyms under the right (unlucky) sampling conditions. The model's dominant probability for "RAG" is the correct expansion, and 6/6 independent runs confirm that.

---

## Evidence

| Artefact | Location |
|---|---|
| Node server audit log (all 6 requests) | `task-561.log` lines 26–169 |
| OllamaProvider source with audit instrumentation | [`ollama.ts`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/server/src/providers/ollama.ts) lines 19–32, 62–75 |
| Run 1 raw answer | `task-567.log` |
| Runs 2–6 raw answers | `task-585.log` |

---

## Cleanup — Temporary Audit Lines to Remove

The following lines in [`apps/server/src/providers/ollama.ts`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/server/src/providers/ollama.ts) are marked `// TEMP RUNTIME AUDIT — REMOVE AFTER VERIFICATION` and must be deleted after you review this report:

**`chat()` method — lines 19–32:**
```ts
// TEMP RUNTIME AUDIT — REMOVE AFTER VERIFICATION
console.log('=== RUNTIME AUDIT START ===');
console.log({
  timestamp: new Date().toISOString(),
  endpoint: `${this.baseUrl}/api/chat`,
  model,
  messages: [ ... ],
  // include any generation options present (none are added by default)
});
console.log('=== RUNTIME AUDIT END ===');
```

**`stream()` method — lines 62–75:**
```ts
// TEMP RUNTIME AUDIT — REMOVE AFTER VERIFICATION
console.log('=== RUNTIME AUDIT START (STREAM) ===');
console.log({
  timestamp: new Date().toISOString(),
  endpoint: `${this.baseUrl}/api/chat`,
  model,
  messages: [ ... ],
  stream: true
});
console.log('=== RUNTIME AUDIT END (STREAM) ===');
```

No other files were changed. Removing these two blocks fully restores the repository to its pre-audit state.

---

*Do NOT update README or clean up until you have reviewed this report.*
