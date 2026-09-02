import "dotenv/config";
import express from "express";
import cors from "cors";
import { getProvider } from "./providers/providerFactory.js";
import { OllamaProvider } from "./providers/ollama.js";
import type { ChatMessage } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/models", async (_, res) => {
  try {
    const response = await fetch("http://localhost:11434/api/tags");

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();

    const models = Array.isArray(data.models)
      ? data.models.map((model: { name?: string }) => model.name).filter(Boolean)
      : [];

    res.json({ models });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Unable to load Ollama models."
    });
  }
});

app.get("/api/omniguard/health", async (req, res) => {
  const targetUrl =
    (req.query.omniguardUrl as string) ||
    process.env.OMNIGUARD_URL ||
    "http://localhost:8000";

  try {
    const response = await fetch(`${targetUrl}/health`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: e instanceof Error ? e.message : "OmniGuard service unreachable."
    });
  }
});

app.post("/api/omniguard/query", async (req, res) => {
  const {
    query,
    message,
    provider = "ollama",
    model = "llama3.2",
    top_k = 10,
    tenant_id = "default",
    enable_cov = true,
    omniguardUrl
  } = req.body;

  const queryText = query || message;
  if (!queryText) {
    return res.status(400).json({ error: "query or message is required." });
  }

  const targetUrl =
    omniguardUrl || process.env.OMNIGUARD_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${targetUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: queryText,
        provider,
        model,
        top_k,
        tenant_id,
        enable_cov
      })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({
      error:
        e instanceof Error
          ? `OmniGuard proxy error: ${e.message}`
          : "OmniGuard proxy failed."
    });
  }
});

app.post("/api/omniguard/ingest", async (req, res) => {
  const { text, metadata, doc_id, omniguardUrl } = req.body;

  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }

  const targetUrl =
    omniguardUrl || process.env.OMNIGUARD_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${targetUrl}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, metadata, doc_id })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({
      error:
        e instanceof Error
          ? `OmniGuard ingest error: ${e.message}`
          : "OmniGuard ingest failed."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  const {
    message,
    history = [],
    provider = "ollama",
    model = process.env.DEFAULT_MODEL || "llama3.2"
  } = req.body as {
    message: string;
    history: ChatMessage[];
    provider: string;
    model: string;
  };

  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    const response = await getProvider(provider).chat(message, history, model);
    res.json({ response });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Unknown error"
    });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  const {
    message,
    history = [],
    provider = "ollama",
    model = process.env.DEFAULT_MODEL || "llama3.2"
  } = req.body as {
    message: string;
    history: ChatMessage[];
    provider: string;
    model: string;
  };

  if (!message) return res.status(400).json({ error: "message is required" });

  if (provider !== "ollama") {
    return res.status(501).json({
      error: "Streaming is currently implemented for Ollama."
    });
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const providerInstance = getProvider(provider);

    if (!(providerInstance instanceof OllamaProvider)) {
      throw new Error("Ollama streaming provider unavailable.");
    }

    await providerInstance.stream(
      message,
      history,
      model,
      (token) => send({ token })
    );

    send({ done: true });
    res.end();
  } catch (e) {
    send({
      error: e instanceof Error ? e.message : "Unknown error"
    });
    res.end();
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () =>
  console.log(`API running on http://localhost:${port}`)
);

