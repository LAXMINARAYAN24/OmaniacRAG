Viewed server.py:1-120
Viewed pipeline.py:1-100
Viewed types.ts:1-61

# System Architecture, Implementation, Methodologies & Limitations Report

---

## 1. Executive Summary

The codebase implements a **Local AI Assistant with an Enterprise-grade RAG and Defense Control Plane (OmniGuard)**. The platform operates on a **dual-lane architecture**:
1. **Direct Mode (Standard LLM Lane)**: Direct interaction between the user interface and local/remote LLMs (Ollama / Hugging Face) through a Node.js API gateway.
2. **OmniGuard Mode (Defended Lane)**: OmniGuard functions not as a standalone LLM provider, but as an **orchestration, security, retrieval, claim verification, and grounding control plane** that sits between the gateway and the target LLM.

---

## 2. Current Architecture & Physical Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                      React / Vite Web UI                         │
│   (ChatWindow, SettingsModal, OmniGuardStatus Telemetry Strip)   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ HTTP / SSE
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Node.js / Express API Gateway                   │
│   - Routing: /api/chat, /api/chat/stream, /api/models            │
│   - Proxy:   /api/omniguard/query, /api/omniguard/ingest         │
└─────────────────┬───────────────────────────────┬────────────────┘
                  │                               │
        Mode == "direct"                 Mode == "omniguard"
                  │                               │
                  │                               ▼
                  │                 ┌──────────────────────────────┐
                  │                 │  Python OmniGuard Service    │
                  │                 │  (FastAPI / HTTP Server)     │
                  │                 │  ┌────────────────────────┐  │
                  │                 │  │ Ring 0: Security Gate  │  │
                  │                 │  │ Ring 1: Spectral DRS   │  │
                  │                 │  │ Ring 2: Hybrid Retrieve│  │
                  │                 │  │ Ring 3: NLI Verification│ │
                  │                 │  │ Ring 4: CoV & Citations│  │
                  │                 │  └───────────┬────────────┘  │
                  │                 └──────────────┼───────────────┘
                  │                                │
                  ▼                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Ollama LLM Instance                         │
│               (/api/chat, /api/tags, /api/generate)              │
└──────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Layer | Technology | Primary Files | Primary Responsibility |
|---|---|---|---|
| **Frontend** | React 18, Vite, TypeScript | [`apps/web/src/App.tsx`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/web/src/App.tsx), [`types.ts`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/web/src/types.ts), [`api.ts`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/web/src/lib/api.ts) | UI layout, chat history (`localStorage`), telemetry visualization, provider/mode toggling. |
| **API Gateway** | Node.js, Express, TypeScript | [`apps/server/src/index.ts`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/server/src/index.ts), [`providers/ollama.ts`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/server/src/providers/ollama.ts) | Stateless proxy, SSE token streaming, provider abstraction, CORS management. |
| **Control Plane** | Python 3.11+, PyTorch, NumPy | [`omniguard/server.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/server.py), [`omniguard/pipeline.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/pipeline.py) | Security screening, dense/sparse retrieval, NLI claim verification, graph consensus, citation tracking. |
| **Inference Engine** | Ollama local daemon | Local host (`:11434`) | Native weights token generation (`qwen3`, `llama3.2`, `gemma3`). |

---

## 3. Current Implementation Details

### 3.1 Frontend Web Application (`apps/web`)
* **State Management**: Chat sessions and settings are saved in the browser's `localStorage` (`chats` key).
* **Modes & Providers**:
  * `provider`: `"ollama" | "huggingface"`
  * `mode`: `"direct" | "omniguard"`
* **Telemetry Mapping**: Renders a dedicated status bar ([`OmniGuardStatus.tsx`](file:///c:/Users/sahul/Desktop/Practical%20Training/apps/web/src/components/OmniGuardStatus.tsx)) tracking:
  * Route action (`STANDARD_PASS`, `HIGH_RISK_QUARANTINE`, `ABSTAIN`)
  * Latency (ms)
  * Verified vs. Quarantined chunk counts
  * 3 distinct mathematical grounding metrics:
    1. **Sentence Grounding Ratio**: Sentence-level NLI entailment of cited sentences.
    2. **Citation Precision**: Proportion of citations mapped to valid retrieved chunks.
    3. **CoV Grounding Score**: Claim-level support ratio (supported claims / total extracted).

### 3.2 Node.js API Gateway (`apps/server`)
* **Direct Mode Streaming**: Implements Server-Sent Events (SSE) via `POST /api/chat/stream` consuming Ollama's streaming ndjson API.
* **OmniGuard Proxy**:
  * `GET /api/omniguard/health`: Proxies service status, indexed chunks count, and model metadata.
  * `POST /api/omniguard/query`: Proxies query requests with user-selected `model` and `provider`.
  * `POST /api/omniguard/ingest`: Proxies raw text and metadata into the vector index.

### 3.3 Python OmniGuard Pipeline (`omniguard`)
* **Request-Aware LLM Closure**: [`omniguard/server.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/server.py#L74-L87) uses a closure factory (`make_llm_generator(provider, model)`) passing the request's chosen model dynamically down the pipeline without mutating global pipeline state.
* **The 4-Ring Defense Architecture** ([`omniguard/pipeline.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/pipeline.py)):
  1. **Ring 0 / Ingestion & Query Security**:
     * [`InjectionScreener`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/gateway/injection_screener.py): RegEx and heuristics checking for prompt injection, jailbreak keywords, and system prompt exfiltration.
     * [`ParserSandbox`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/gateway/parser_sandbox.py): Sanitizes raw input documents and detects poisoned tokens.
  2. **Ring 1 / Embedding & Dynamic Reliability Scoring (DRS)**:
     * [`DenseNeuralEmbeddingProvider`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/embeddings/neural_provider.py): Computes semantic vector embeddings.
     * [`DRSEngine`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/embeddings/drs_engine.py): Spectral density estimation and distance metric learning to score embedding reliability and identify out-of-distribution vectors.
  3. **Ring 2 / Hybrid Retrieval & Cross-Reranking**:
     * [`DenseRetriever`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/retrieval/dense_retriever.py): Semantic cosine similarity search over in-memory chunk embeddings.
     * [`BM25Retriever`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/retrieval/bm25_retriever.py): Term-frequency/inverted-index keyword search.
     * [`HybridFusion`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/retrieval/hybrid_fusion.py): Merges dense and sparse ranks via Reciprocal Rank Fusion (RRF).
     * [`CrossEncoderReranker`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/retrieval/cross_reranker.py): Deep re-ranking of the top fused candidates.
  4. **Ring 3 / Claims, NLI & Graph Consensus**:
     * [`ClaimExtractor`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/claims/claim_extractor.py): Decomposes generated drafts into verifiable atomic claims.
     * [`NLIVerifier`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/claims/nli_verifier.py): Computes Natural Language Inference entailment/neutral/contradiction probabilities against retrieved chunks.
     * [`LGOConsensusAnalyzer`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/consensus/lgo_analyzer.py): Construct an evidence graph across retrieved documents, computing Generalized Weak Component Clustering (GWCC v2) to detect contradictory evidence clusters.
  5. **Ring 4 / Generation, CoV & Calibrated Abstention**:
     * [`PromptAssembler`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/prompt_assembler.py): Wraps context in strict XML tags (`<context>`, `[Doc X]`) with anti-hallucination instructions.
     * [`ChainOfVerificationEngine`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/cov_engine.py): Formulates verification sub-queries, executes them against retrieved context, and revises output if claims are refuted.
     * [`CitationTracker`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/citation_tracker.py): Regex verification auditing that every `[Doc X]` token maps to an extant retrieved chunk.
     * [`CalibratedAbstentionEngine`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/abstention_engine.py): Enforces safety refusal when overall claim confidence or grounding falls below threshold.

---

## 4. Methodologies & Algorithmic Foundations

| Methodology | Mathematical / Logical Implementation | Purpose in Pipeline |
|---|---|---|
| **Reciprocal Rank Fusion (RRF)** | $RRF\_Score(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$ where $k=60$ | Combines keyword (BM25) and dense embeddings without score normalization distortions. |
| **Spectral Density Normalization (DRS)** | Kernel density estimation over embedding subspace eigenvalues | Prevents "hubness" artifacts in vector search where certain dense vectors dominate cosine neighborhoods. |
| **Atomic Claim Decomposition** | Syntactic parsing & dependency tree splitting | Extracts standalone subject-predicate-object propositions from model responses for verification. |
| **3-Way NLI Entailment Verification** | Softmax classification over cross-attention states: $P(\text{Entailment}) > 0.50$ | Eliminates reliance on the LLM's subjective self-evaluation; independently checks factual entailment. |
| **Evidence Graph Consensus (GWCC v2)** | Connected component analysis on bipartite claim-evidence graph | Isolates malicious conflicting documents injected into the corpus. |
| **Chain-of-Verification (CoV)** | Multi-turn query synthesis: Generation $\rightarrow$ Verification Query Generation $\rightarrow$ Execution $\rightarrow$ Revision | Forces internal logical consistency before returning the final response. |

---

## 5. System Limitations

### 5.1 Storage & Persistence Limitations
* **In-Memory Vector Store**: The `DenseRetriever` maintains chunk embeddings in Python memory (`chunks: List[ProductionChunk]`). Restarting the Python process **wipes all indexed documents**.
* **In-Memory Trust Store**: `PersistentTrustStore` audit logs and hash chains default to an in-memory ledger when no disk path is configured.
* **Client-Side History**: Conversation memory lives exclusively in browser `localStorage`. If the user clears browser data or changes machines, conversation history is lost.

### 5.2 Streaming & Latency Constraints
* **OmniGuard Blocking Execution**: Direct mode supports token streaming (`/api/chat/stream`), but OmniGuard mode is strictly **synchronous and blocking**. The pipeline must wait for generation, claim extraction, NLI scoring, and CoV revision to finish before returning the payload.
* **Multi-Model Inference Overhead**: A single defended query can trigger 2–4 LLM roundtrips (Draft Generation, Verification Query Generation, CoV Execution, Final Revision) plus multiple NLI cross-encoder forward passes, resulting in 5s–30s latency per query depending on hardware.

### 5.3 Model & Provider Support Constraints
* **Ollama Dependency in Defense Layer**: While the Node.js layer and Direct Mode support Hugging Face, the Python OmniGuard service explicitly enforces:
  ```python
  if provider == "huggingface":
      raise ValueError("Hugging Face generation is not yet supported by the OmniGuard Python service.")
  ```
  OmniGuard currently only supports Ollama backends.
* **Stateless Chat Context in RAG**: The OmniGuard query pipeline currently processes queries as single-turn inputs (`query_text`), without incorporating the multi-turn chat history array into the retrieval query reformulation.

### 5.4 Cold-Start Calibration
* **DRS Initialization**: `DRSEngine` requires empirical variance and density calibration over an initial sample set. On a clean cold boot, `drs_calibrated` returns `false` until sufficient corpus density is observed.

---

## 6. Architecture Status Matrix

| Capability | Direct Mode | OmniGuard Mode | Status |
|---|---|---|---|
| Token Streaming | ✅ Implemented (SSE) | ❌ Not Implemented (Blocking) | Operational in Direct only |
| Ollama Provider | ✅ Supported | ✅ Supported | Fully Verified |
| Hugging Face Provider | ✅ Supported | ❌ Not Supported | Gateway only |
| Prompt Injection Screening | ❌ None | ✅ Implemented (Ring 0) | Active |
| Sparse-Dense Retrieval | ❌ None | ✅ Implemented (Ring 2) | Active |
| Claim NLI Entailment | ❌ None | ✅ Implemented (Ring 3) | Active |
| Verifiable In-line Citations | ❌ None | ✅ Implemented (Ring 4) | Active |
| Persistent Storage (Disk) | ❌ (Client `localStorage`) | ❌ (In-Memory default) | Ephemeral on server |