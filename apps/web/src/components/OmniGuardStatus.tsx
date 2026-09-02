import { useState } from "react";
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ShieldAlert,
  Info
} from "lucide-react";
import type { OmniGuardStatusData } from "../types";

type Props = {
  status: OmniGuardStatusData;
};

/** Tooltip wrapper — shows text on hover */
function Tip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <span className="group relative inline-flex items-center gap-1 cursor-default">
      {children}
      <Info size={10} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[10px] text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
        {tip}
      </span>
    </span>
  );
}

export function OmniGuardStatus({ status }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isSuccess = status.generationState === "ANSWER";
  const isBlock = status.generationState === "SECURITY_BLOCK";

  const confidencePct = Math.round((status.confidence ?? 0) * 100);
  const precisionPct = Math.round((status.citationPrecision ?? 0) * 100);
  const groundingPct = Math.round((status.groundingRatio ?? 0) * 100);
  const entailmentPct = Math.round((status.citationEntailmentPrecision ?? 0) * 100);
  const covPct = Math.round((status.covGroundingScore ?? 0) * 100);
  const latencySec = ((status.latencyMs ?? 0) / 1000).toFixed(2);

  // Colour-code grounding by value
  const groundingColour =
    groundingPct >= 80
      ? "text-emerald-700"
      : groundingPct >= 40
      ? "text-amber-600"
      : "text-red-600";

  return (
    <div className="mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-2.5 text-xs text-gray-700 shadow-sm transition-all">
      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isBlock ? (
            <ShieldAlert size={16} className="text-amber-600" />
          ) : (
            <ShieldCheck size={16} className="text-emerald-600" />
          )}
          <span className="font-semibold text-gray-900">OmniGuard-RAG</span>
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              isSuccess
                ? "bg-emerald-100 text-emerald-800"
                : isBlock
                ? "bg-amber-100 text-amber-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {status.generationState}
          </span>
          {status.route && (
            <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-600">
              {status.route}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-gray-600">
            <span title="Pipeline confidence score">
              Conf: <strong className="text-gray-900">{confidencePct}%</strong>
            </span>
            <span title="Fraction of inline citations pointing to valid retrieved chunks">
              Precision: <strong className="text-gray-900">{precisionPct}%</strong>
            </span>
            <span title="Fraction of cited sentences NLI-entailed by their chunk">
              Grounding:{" "}
              <strong className={groundingColour}>{groundingPct}%</strong>
            </span>
            <span title="Total pipeline latency">{latencySec}s</span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-800"
            aria-label="Toggle details"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Expanded drawer ── */}
      {expanded && (
        <div className="mt-2.5 border-t border-emerald-200/60 pt-2 space-y-2">
          {/* 6-cell audit grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            {/* Grounding Ratio */}
            <div className="rounded bg-white/80 p-2 border border-emerald-100">
              <Tip tip="Sentence-level: fraction of cited sentences where the cited chunk NLI-entails the sentence (threshold ≥ 0.50). 0% means NLI model could not confirm the sentence against its cited evidence.">
                <div className="text-gray-400">Grounding Ratio</div>
              </Tip>
              <div className={`text-base font-bold mt-0.5 ${groundingColour}`}>
                {groundingPct}%
              </div>
            </div>

            {/* Citation Entailment Precision */}
            <div className="rounded bg-white/80 p-2 border border-emerald-100">
              <Tip tip="Per-citation entailment: fraction of individually checked citations where NLI entailment ≥ 0.50. Differs from Grounding Ratio (sentence-level) by counting citations, not sentences.">
                <div className="text-gray-400">Entailment Prec.</div>
              </Tip>
              <div className={`text-base font-bold mt-0.5 ${entailmentPct >= 60 ? "text-emerald-700" : entailmentPct >= 30 ? "text-amber-600" : "text-red-600"}`}>
                {entailmentPct}%
              </div>
            </div>

            {/* CoV Grounding Score */}
            <div className="rounded bg-white/80 p-2 border border-emerald-100">
              <Tip tip="CoV claim-level: fraction of atomic claims in the baseline response that were confirmed by NLI cross-check against verified chunks. Measures whether the LLM's individual factual claims are supported.">
                <div className="text-gray-400">CoV Claim Support</div>
              </Tip>
              <div className={`text-base font-bold mt-0.5 ${covPct >= 60 ? "text-emerald-700" : covPct >= 30 ? "text-amber-600" : "text-red-600"}`}>
                {covPct}%
              </div>
            </div>

            {/* Verified Chunks */}
            <div className="rounded bg-white/80 p-2 border border-emerald-100">
              <div className="text-gray-400">Verified Chunks</div>
              <div className="text-base font-bold mt-0.5 text-gray-800">
                {status.verifiedChunkCount}
              </div>
            </div>

            {/* Quarantined */}
            <div className="rounded bg-white/80 p-2 border border-emerald-100">
              <div className="text-gray-400">Quarantined</div>
              <div className={`text-base font-bold mt-0.5 ${status.quarantinedChunkCount > 0 ? "text-amber-600" : "text-gray-800"}`}>
                {status.quarantinedChunkCount}
              </div>
            </div>

            {/* Fully Grounded */}
            <div className="rounded bg-white/80 p-2 border border-emerald-100">
              <Tip tip="True when: all citations are valid, at least one citation exists, and citation entailment precision ≥ 60%.">
                <div className="text-gray-400">Fully Grounded</div>
              </Tip>
              <div className={`text-base font-bold mt-0.5 ${status.isFullyGrounded ? "text-emerald-700" : "text-amber-600"}`}>
                {status.isFullyGrounded ? "Yes" : "Partial"}
              </div>
            </div>
          </div>

          {/* Citation count row */}
          {status.citations && (
            <div className="text-[10px] text-gray-500 pt-0.5 flex items-center gap-2">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span>
                Citations:{" "}
                <strong className="text-gray-700">
                  {status.citations.validCitations} valid
                </strong>{" "}
                / {status.citations.totalCitations} total
                {status.citations.invalidCitations > 0 && (
                  <span className="ml-1 text-red-500">
                    ({status.citations.invalidCitations} invalid)
                  </span>
                )}
              </span>
              <span className="ml-2">
                Recall:{" "}
                <strong className="text-gray-700">
                  {Math.round((status.citationRecall ?? 0) * 100)}%
                </strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
