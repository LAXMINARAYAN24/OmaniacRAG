"""
base.py — Abstract Base Class for Embedding Providers.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import List
import numpy as np


class EmbeddingProvider(ABC):
    """Abstract interface for dense and neural embedding models."""

    @abstractmethod
    def embed_text(self, text: str) -> np.ndarray:
        """Computes a 1D embedding vector for a single string."""
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> np.ndarray:
        """Computes a 2D embedding matrix (N, dim) for a list of strings."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the embedding feature dimension."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Returns the name or identifier of the underlying model."""
        pass

    def fit_corpus(self, texts: List[str]):
        """Optional hook to adapt or calibrate the embedding provider to a corpus."""
        pass
