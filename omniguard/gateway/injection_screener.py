"""
injection_screener.py — Prompt Injection, Jailbreak, and Malicious Payload Detector.

Provides heuristic, regex, and pattern-based screening of user queries and ingested chunks
for adversarial instructions, system prompt overrides, and evasive token patterns.
"""
from __future__ import annotations
import re
from typing import Dict, Any, List

# Compiled regexes for prompt injection, jailbreak attempts, and instruction overrides
INJECTION_PATTERNS = [
    (re.compile(r"\b(ignore|disregard|forget|override|bypass)\s+(all\s+)?(previous|prior|above|existing)\s+(instructions|prompts|rules|commands|constraints)\b", re.IGNORECASE), "PROMPT_INJECTION_OVERRIDE", 0.95),
    (re.compile(r"\b(system\s+prompt|system\s+message|developer\s+mode|jailbreak|DAN\s+mode)\b", re.IGNORECASE), "SYSTEM_PROMPT_PROBE", 0.85),
    (re.compile(r"\byou\s+are\s+now\s+(unconstrained|unfiltered|free|evil|DAN)\b", re.IGNORECASE), "ROLEPLAY_JAILBREAK", 0.90),
    (re.compile(r"\b(show|reveal|print|output|display)\s+(the\s+)?(full\s+)?(system\s+prompt|hidden\s+instructions|initial\s+prompt)\b", re.IGNORECASE), "SYSTEM_PROMPT_LEAK_ATTEMPT", 0.90),
    (re.compile(r"\b(do\s+anything\s+now|hypothetical\s+scenario\s+where\s+you\s+have\s+no\s+rules)\b", re.IGNORECASE), "JAILBREAK_HEURISTIC", 0.85),
    (re.compile(r"<\s*script[^>]*>|javascript:|data:text/html", re.IGNORECASE), "XSS_SCRIPT_PAYLOAD", 0.95),
    (re.compile(r"\bexec\s*\(|eval\s*\(|__import__\s*\(|os\.system\s*\(", re.IGNORECASE), "CODE_EXECUTION_PAYLOAD", 0.95),
]


class InjectionScreener:
    """Detects prompt injection, evasion patterns, and malicious instructions in text."""

    def __init__(self, risk_threshold: float = 0.80):
        self.risk_threshold = risk_threshold

    def screen_text(self, text: str) -> Dict[str, Any]:
        """Evaluates input text for injection vulnerabilities and security flags."""
        if not text or not isinstance(text, str):
            return {
                "is_suspicious": False,
                "injection_risk": 0.0,
                "matched_flags": []
            }

        matched_flags: List[str] = []
        max_risk: float = 0.0

        for pattern, flag_name, risk_weight in INJECTION_PATTERNS:
            if pattern.search(text):
                matched_flags.append(flag_name)
                if risk_weight > max_risk:
                    max_risk = risk_weight

        is_suspicious = len(matched_flags) > 0 or max_risk >= self.risk_threshold

        return {
            "is_suspicious": is_suspicious,
            "injection_risk": round(max_risk, 4),
            "matched_flags": matched_flags
        }
