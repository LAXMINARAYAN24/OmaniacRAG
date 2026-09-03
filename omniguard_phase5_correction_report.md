# OmniGuard Phase 5 — Defense Correction & Regression Report

**Date**: 2026-09-03  
**Status**: Completed & Empirically Verified  
**Target Environment**: Node.js Gateway (`:3000`) $\rightarrow$ Python OmniGuard Service (`:8000`) $\rightarrow$ Ollama (`:11434`, `qwen3:latest`)  
**Baseline Report Preserved**: [`omniguard_validation_report.md`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard_validation_report.md)

---

## 1. Executive Summary of Corrections

In Phase 4, empirical defense testing revealed two critical defects:
1. **Priority 1 (❌ Missing-Evidence Abstention Failure)**: When queried for unknown facts (e.g., "Who was the CEO of Project Orion?"), CoV correctly detected that 0/4 claims were supported, but the pipeline returned `ANSWER` (95% confidence) with an irrelevant citation because `cov_engine` had a fallback synthesizing an answer from the first available chunk, and `abstention_engine` did not evaluate CoV support.
2. **Priority 2 (🔧 Ring-3 GWCC Serialization Bug)**: When contradictory documents triggered Ring 3 GWCC consensus, the HTTP server crashed with `500 TypeError: Object of type ProductionChunk is not JSON serializable` because `GWCCDecision.__dict__` contained raw dataclass instances.

In Phase 5, both defects were addressed with targeted, principled corrections **without altering core consensus or retrieval algorithms**. Both fixes were empirically verified through live HTTP regression tests.

---

## 2. Before vs. After Regression Matrix

| Test Scenario | Phase 4 Baseline (BEFORE) | Phase 5 Verified (AFTER) | Resolution Status |
|---|---|---|---|
| **Test B: Missing Evidence**<br>*"Who was the CEO of Project Orion?"* | **State**: `ANSWER` ❌<br>**Confidence**: `0.95`<br>**Output**: *"According to verified records, Project Orion was launched in 2024. The project was developed by the Orion Research Group [Doc: corpus1_doc1]"*<br>**CoV**: `supported: 0, unsupported: 4` | **State**: `INSUFFICIENT_EVIDENCE` ✅<br>**Confidence**: `0.05`<br>**Output**: *"The provided evidence does not contain information to answer this query."*<br>**CoV**: `supported: 0, unsupported: 3`<br>**HTTP**: `200 OK` (19,373 ms) | ✅ **Genuine Defense Correction**<br>No more irrelevant factual non-sequitur; pipeline cleanly abstains on missing evidence. |
| **Test C: Contradictory Evidence**<br>*Doc A (2024) vs Doc B (2026)* | **State**: HTTP `500 Internal Server Error` ❌<br>**Error**: `TypeError: Object of type ProductionChunk is not JSON serializable`<br>**Algorithm**: GWCC detected contradiction (`0.9972`), but failed at HTTP response serialization | **State**: HTTP `200 OK` ✅ (32,742 ms)<br>**Route**: `TARGETED_CONSENSUS`<br>**GWCC Status**: `COLLUSION_DISCARDED`<br>**Quarantined**: 2 chunks (`corpus2_doc_A`, `corpus1_doc1`)<br>**Selected**: 1 clean chunk (`corpus2_doc_B`)<br>**LGO Delta**: `3.9918` | ✅ **Serialization Bug Resolved**<br>Full GWCC consensus telemetry returned cleanly in JSON without modifying consensus logic. |
| **Test E: Partially Supported**<br>*Partial facts available* | **State**: `PARTIAL_ANSWER` ✅<br>**Confidence**: `0.65`<br>**CoV Score**: `0.6667` (2/3 supported) | **State**: `PARTIAL_ANSWER` ✅<br>**Confidence**: `0.65`<br>Preserved intact; partial answer policy remains fully functional. | ✅ **Zero Regression**<br>Partially supported queries continue to produce legitimate partial answers. |

---

## 3. Detailed Root Causes & Code Modifications

### Priority 1: Missing-Evidence Abstention Correction

#### Root Cause 1A: Unrelated Chunk Substitution in CoV
In [`omniguard/generation/cov_engine.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/cov_engine.py) (lines 126–134), when none of the generated claims were supported by evidence (`not supported_checks`), the engine had a fallback that constructed a synthetic answer from `primary_chunks[0]`:
```python
# PREVIOUS CODE (DEFECTIVE):
if not supported_checks and primary_chunks:
    top_chunk = primary_chunks[0]
    revised_response = f"According to verified records, {top_chunk.clean_text} [Doc: ...]"
```
This took whatever chunk was closest in vector space and presented it as the answer, even if completely irrelevant to the user's question.

**Correction**:
```python
# PHASE 5 CORRECTION:
if not supported_checks:
    # When none of the generated claims are supported by verified evidence,
    # do not force-inject an unrelated chunk. Express insufficient evidence.
    revised_response = "The provided evidence does not contain information to answer this query."
```

#### Root Cause 1B: Disconnect Between CoV and Abstention Engine
In [`omniguard/generation/abstention_engine.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/abstention_engine.py), `evaluate_post_generation` did not accept or evaluate `cov_result`. Because the substituted chunk had a valid citation tag, the citation tracker reported `valid_citations: 1, invalid_citations: 0`, causing the abstention engine to declare `GenerationState.ANSWER` with `0.95` confidence.

**Correction**:
1. Updated `evaluate_post_generation` to accept `cov_result: Optional[Any] = None`.
2. Added negative declaration checks for explicit statements of missing information.
3. Added zero-support CoV enforcement:
```python
# PHASE 5 CORRECTION:
if cov_result is not None and getattr(cov_result, "verification_checks", None):
    checks = cov_result.verification_checks
    supported_count = sum(1 for c in checks if getattr(c, "is_supported", False))
    if supported_count == 0 and len(checks) > 0:
        return AbstentionDecision(
            state=GenerationState.INSUFFICIENT_EVIDENCE,
            final_output="The provided evidence does not contain information to answer this query.",
            confidence=0.05,
            reason="All extracted answer claims were unsupported by verified evidence (CoV grounding score = 0.0).",
            can_proceed_to_generate=False
        )
```
4. In [`omniguard/pipeline.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/pipeline.py) (line 476), forwarded `cov_result=cov_res` into `self.abstention_engine.evaluate_post_generation(...)`.

---

### Priority 2: Ring-3 GWCC Serialization Correction

#### Root Cause
In [`omniguard/consensus/lgo_analyzer.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/consensus/lgo_analyzer.py), `GWCCDecision` stores `selected_chunks: List[ProductionChunk]` and `quarantined_chunks: List[ProductionChunk]`. When [`omniguard/pipeline.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/pipeline.py) assigned `ring_telemetry["ring_3_gwcc"] = consensus_decision.__dict__`, the raw dataclass instances were passed directly to `json.dumps()`, which cannot serialize custom Python objects.

**Correction**:
1. Added `to_dict(self)` method to `GWCCDecision` in [`omniguard/consensus/lgo_analyzer.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/consensus/lgo_analyzer.py):
```python
# PHASE 5 CORRECTION:
def to_dict(self) -> Dict[str, Any]:
    return {
        "status": self.status.value if hasattr(self.status, "value") else str(self.status),
        "confidence_score": round(float(self.confidence_score), 4),
        "selected_cluster_id": self.selected_cluster_id,
        "lgo_delta": round(float(self.lgo_delta), 4),
        "counterfactual_deltas": {int(k): round(float(v), 4) for k, v in self.counterfactual_deltas.items()},
        "explanation": self.explanation,
        "selected_chunk_ids": [c.chunk_id for c in self.selected_chunks],
        "quarantined_chunk_ids": [c.chunk_id for c in self.quarantined_chunks],
        "group_telemetry": self.group_telemetry
    }
```
2. Updated [`omniguard/pipeline.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/pipeline.py) to assign `consensus_decision.to_dict()` in `ring_telemetry`.
3. Added `_serialize_ring_telemetry()` in `PipelineExecutionResult` to defensively sanitize any nested chunk lists into JSON-primitive IDs.

---

## 4. Live Regression Verification Logs

### Regression Test B Log (Node Gateway $\rightarrow$ Python Service)
```text
=== EXECUTING REGRESSION TEST B (NODE -> PYTHON HTTP) ===
HTTP STATUS: 200 OK (Latency: 19,373 ms)
GENERATION STATE: INSUFFICIENT_EVIDENCE
CONFIDENCE: 0.05
ANSWER TEXT: The provided evidence does not contain information to answer this query.
COV TELEMETRY: {
  "total_claims_checked": 3,
  "supported_claims": 0,
  "unsupported_claims": 3,
  "multi_domain_corroborated_claims": 0,
  "corroboration_ratio": 1
}
```

### Regression Test C Log (Node Gateway $\rightarrow$ Python Service)
```text
=== EXECUTING REGRESSION TEST C (NODE -> PYTHON HTTP) ===
HTTP STATUS: 200 OK (Latency: 32,742 ms)
GENERATION STATE: ANSWER
CONFIDENCE: 0.95
ANSWER TEXT: Project Orion was launched in 2026 [Doc: corpus2_doc_B | Chunk: 0 | Hash: 172e372b].
ROUTE: TARGETED_CONSENSUS
RING 3 GWCC STATUS: COLLUSION_DISCARDED
RING 3 GWCC EXPLANATION: Leave-group-out causal test identified 1 contradictory cluster(s) as contradiction source (max contradiction drop 3.992). Quarantined 2 poisoned chunks, selected 1 from 1 clean cluster(s).
SELECTED CHUNK IDS: corpus2_doc_B_chk_0
QUARANTINED CHUNK IDS: corpus2_doc_A_chk_0, corpus1_doc1_chk_0
LGO DELTA: 3.9918
VERIFIED CHUNKS COUNT: 1
QUARANTINED CHUNKS COUNT: 2
```

---

## 5. Summary of Files Modified in Phase 5

| File | Change Description |
|---|---|
| [`omniguard/consensus/lgo_analyzer.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/consensus/lgo_analyzer.py) | Added `GWCCDecision.to_dict()` converting `ProductionChunk` lists to primitive `chunk_id` lists. |
| [`omniguard/generation/cov_engine.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/cov_engine.py) | Replaced unrelated `top_chunk` fallback with explicit insufficient evidence declaration when 0 claims are supported. |
| [`omniguard/generation/abstention_engine.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/generation/abstention_engine.py) | Updated `evaluate_post_generation` to accept `cov_result`, enforce `INSUFFICIENT_EVIDENCE` when CoV support is 0, and recognize negative text declarations. |
| [`omniguard/pipeline.py`](file:///c:/Users/sahul/Desktop/Practical%20Training/omniguard/pipeline.py) | Passed `cov_result` into post-generation evaluation and added defensive `_serialize_ring_telemetry()` ensuring clean JSON serialization. |
