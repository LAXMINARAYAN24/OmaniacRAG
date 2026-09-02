"""
density_normalizer.py — Embedding Density Normalizer & Feature Scaler.

Provides statistical whitening and normalization for vector space density calibration.
"""
from __future__ import annotations
from typing import Optional
import numpy as np


class DensityNormalizer:
    """Normalizes embedding densities and whitens feature distributions."""

    def __init__(self, eps: float = 1e-6):
        self.eps = eps
        self.mean: Optional[np.ndarray] = None
        self.std: Optional[np.ndarray] = None

    def fit(self, embeddings: np.ndarray):
        """Computes mean and standard deviation across embedding dimensions."""
        self.mean = np.mean(embeddings, axis=0)
        self.std = np.std(embeddings, axis=0) + self.eps

    def transform(self, embeddings: np.ndarray) -> np.ndarray:
        """Applies z-score normalization to input embeddings."""
        if self.mean is None or self.std is None:
            return embeddings
        return (embeddings - self.mean) / self.std

    def fit_transform(self, embeddings: np.ndarray) -> np.ndarray:
        """Fits and transforms embeddings in a single pass."""
        self.fit(embeddings)
        return self.transform(embeddings)
