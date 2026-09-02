export type Role = "user" | "assistant";

export type OmniGuardStatusData = {
  route?: string;
  generationState: string;
  confidence: number;

  /** Fraction of inline citations pointing to valid retrieved chunks. */
  citationPrecision: number;
  /** Fraction of retrieved chunks actually cited in the response. */
  citationRecall: number;
  /**
   * Fraction of cited sentences where the cited chunk NLI-entails the sentence text.
   * 0% means the NLI model could not confirm any sentence against its cited chunk.
   */
  groundingRatio: number;
  /**
   * Fraction of valid citation checks where NLI entailment >= 0.50.
   * Distinct from groundingRatio: this is per-citation not per-sentence.
   */
  citationEntailmentPrecision: number;
  /**
   * CoV claim-level grounding score: supported_claims / total_claims_extracted.
   * Distinct from groundingRatio (sentence-level NLI) and citationPrecision (citation validity).
   */
  covGroundingScore: number;

  isFullyGrounded: boolean;
  verifiedChunkCount: number;
  quarantinedChunkCount: number;
  latencyMs: number;
  citations?: {
    totalCitations: number;
    validCitations: number;
    invalidCitations: number;
  };
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  omniguard?: OmniGuardStatusData;
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type Settings = {
  provider: "ollama" | "huggingface";
  model: string;
  backendUrl: string;
  mode: "direct" | "omniguard";
  omniguardUrl: string;
};
