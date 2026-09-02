"""
tracer.py — High-Resolution Pipeline Tracing & Span Telemetry.
"""
from __future__ import annotations
import time
from typing import Dict, Any, List, Optional


class PipelineSpan:
    """Individual execution span measuring latency and stage-specific metadata."""

    def __init__(self, name: str):
        self.name = name
        self.start_time = time.perf_counter()
        self.end_time: Optional[float] = None
        self.duration_ms: float = 0.0
        self.metadata: Dict[str, Any] = {}

    def finish(self, **kwargs):
        """Marks span completion and records metadata."""
        self.end_time = time.perf_counter()
        self.duration_ms = (self.end_time - self.start_time) * 1000.0
        self.metadata = kwargs

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "duration_ms": round(self.duration_ms, 2),
            **self.metadata
        }


class PipelineTracer:
    """Collects multi-stage telemetry spans across the pipeline execution."""

    def __init__(self):
        self.start_time = time.perf_counter()
        self.spans: List[PipelineSpan] = []

    def start_span(self, name: str) -> PipelineSpan:
        """Starts a new named execution span."""
        span = PipelineSpan(name)
        self.spans.append(span)
        return span

    def finish_trace(self) -> Dict[str, Any]:
        """Finalizes trace recording and compiles performance metrics."""
        total_ms = (time.perf_counter() - self.start_time) * 1000.0
        return {
            "total_duration_ms": round(total_ms, 2),
            "spans": [s.to_dict() for s in self.spans]
        }
