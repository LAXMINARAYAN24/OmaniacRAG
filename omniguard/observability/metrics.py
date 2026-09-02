"""
metrics.py — Production Metrics Collector for Latency, Abstention & Grounding.
"""
from __future__ import annotations
from typing import Dict, Any, List


class ProductionMetricsCollector:
    """Collects aggregated runtime performance and defense metrics."""

    def __init__(self):
        self.total_queries: int = 0
        self.blocked_queries: int = 0
        self.latencies_ms: List[float] = []
        self.grounding_ratios: List[float] = []
        self.citation_precisions: List[float] = []
        self.ring_block_counts: Dict[str, int] = {}

    def record_query(self,
                     total_latency_ms: float = 0.0,
                     is_blocked: bool = False,
                     quarantined_ring: str = "",
                     citation_precision: float = 0.0,
                     citation_recall: float = 0.0,
                     grounding_ratio: float = 0.0):
        """Records telemetry data point for an executed query."""
        self.total_queries += 1
        self.latencies_ms.append(total_latency_ms)

        if is_blocked:
            self.blocked_queries += 1
            if quarantined_ring:
                self.ring_block_counts[quarantined_ring] = (
                    self.ring_block_counts.get(quarantined_ring, 0) + 1
                )
        else:
            self.grounding_ratios.append(grounding_ratio)
            self.citation_precisions.append(citation_precision)

    def get_summary(self) -> Dict[str, Any]:
        """Returns consolidated metrics summary."""
        avg_latency = (
            sum(self.latencies_ms) / len(self.latencies_ms)
            if self.latencies_ms else 0.0
        )
        avg_grounding = (
            sum(self.grounding_ratios) / len(self.grounding_ratios)
            if self.grounding_ratios else 0.0
        )
        avg_citation = (
            sum(self.citation_precisions) / len(self.citation_precisions)
            if self.citation_precisions else 0.0
        )

        return {
            "total_queries": self.total_queries,
            "blocked_queries": self.blocked_queries,
            "avg_latency_ms": round(avg_latency, 2),
            "avg_grounding_ratio": round(avg_grounding, 4),
            "avg_citation_precision": round(avg_citation, 4),
            "ring_block_counts": dict(self.ring_block_counts)
        }
