"""
config.py — Global configuration parameters for OmniGuard.
"""
from __future__ import annotations
import os

HF_TOKEN: str | None = os.environ.get("HF_TOKEN", None)
