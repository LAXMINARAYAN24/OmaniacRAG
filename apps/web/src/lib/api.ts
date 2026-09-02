import type { Message, Settings } from "../types";

export async function streamMessage(
  settings: Settings,
  messages: Message[],
  onToken: (token: string) => void,
  signal?: AbortSignal
) {
  if (messages.length === 0) {
    throw new Error("No messages to send.");
  }

  const latestMessage = messages[messages.length - 1];

  if (latestMessage.role !== "user") {
    throw new Error("Last message must be from the user.");
  }

  const history = messages.slice(0, -1);

  const response = await fetch(
    `${settings.backendUrl}/api/chat/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: latestMessage.content,
        history,
        provider: settings.provider,
        model: settings.model
      }),
      signal
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      errorText || `Request failed: ${response.status}`
    );
  }

  if (!response.body) {
    throw new Error("Streaming is not supported by this response.");
  }

  const reader = response.body.getReader();
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
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();

        if (!data || data === "[DONE]") continue;

        const parsed = JSON.parse(data);

        if (parsed.token) {
          onToken(parsed.token);
        }

        if (parsed.error) {
          throw new Error(parsed.error);
        }

        if (parsed.done) {
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type OmniGuardQueryResponse = {
  query: string;
  generation_state: string;
  answer_text: string;
  confidence: number;
  citations: {
    total_citations: number;
    valid_citations: number;
    invalid_citations: number;
    citation_precision: number;
    citation_recall: number;
    grounding_ratio: number;
    citation_entailment_precision: number;
    is_fully_grounded: boolean;
  };
  verified_chunks: Array<{
    chunk_id: string;
    clean_text: string;
    trust_score: number;
    publisher_domain?: string;
    title?: string;
  }>;
  quarantined_chunks: Array<unknown>;
  /** CoV result — present when enable_cov=true (the default). */
  cov_result?: {
    baseline_response: string;
    revised_response: string;
    grounding_score: number;
    corroboration_ratio: number;
    unsupported_claims_removed: number;
    telemetry: {
      total_claims_checked: number;
      supported_claims: number;
      unsupported_claims: number;
      multi_domain_corroborated_claims: number;
      corroboration_ratio: number;
    };
  };
  ring_telemetry?: Record<string, unknown>;
  trace?: {
    total_duration_ms: number;
  };
};

export async function queryOmniGuard(
  settings: Settings,
  messages: Message[],
  signal?: AbortSignal
): Promise<{ answer: string; status: import("../types").OmniGuardStatusData }> {
  if (messages.length === 0) {
    throw new Error("No messages to send.");
  }

  const latestMessage = messages[messages.length - 1];
  if (latestMessage.role !== "user") {
    throw new Error("Last message must be from the user.");
  }

  const response = await fetch(
    `${settings.backendUrl}/api/omniguard/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: latestMessage.content,
        provider: settings.provider,
        model: settings.model,
        omniguardUrl: settings.omniguardUrl
      }),
      signal
    }
  );

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: `Request failed: ${response.status}` }));
    throw new Error(errorData.error || `OmniGuard query failed: ${response.status}`);
  }

  const data: OmniGuardQueryResponse = await response.json();

  const status: import("../types").OmniGuardStatusData = {
    route:
      (data.ring_telemetry?.ring_2_risk as { routing_action?: string })
        ?.routing_action || "SAFE_PASS",
    generationState: data.generation_state,
    confidence: data.confidence,
    citationPrecision: data.citations?.citation_precision ?? 0,
    citationRecall: data.citations?.citation_recall ?? 0,
    groundingRatio: data.citations?.grounding_ratio ?? 0,
    citationEntailmentPrecision: data.citations?.citation_entailment_precision ?? 0,
    covGroundingScore: data.cov_result?.grounding_score ?? 0,
    isFullyGrounded: data.citations?.is_fully_grounded ?? false,
    verifiedChunkCount: data.verified_chunks?.length ?? 0,
    quarantinedChunkCount: data.quarantined_chunks?.length ?? 0,
    latencyMs: data.trace?.total_duration_ms ?? 0,
    citations: {
      totalCitations: data.citations?.total_citations ?? 0,
      validCitations: data.citations?.valid_citations ?? 0,
      invalidCitations: data.citations?.invalid_citations ?? 0
    }
  };

  return {
    answer: data.answer_text,
    status
  };
}

