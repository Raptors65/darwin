"""Local embedder using sentence-transformers."""

import logging
import os

from sentence_transformers import SentenceTransformer

from embedders.base import BaseEmbedder

logger = logging.getLogger(__name__)

# Default model: all-MiniLM-L6-v2 is fast and good quality (384 dimensions)
DEFAULT_MODEL = "all-MiniLM-L6-v2"


class LocalEmbedder(BaseEmbedder):
    """Local embedding provider using sentence-transformers.

    Uses the all-MiniLM-L6-v2 model by default, which provides:
    - 384-dimensional embeddings
    - Fast inference (even on CPU)
    - Good semantic similarity performance
    """

    def __init__(self, model_name: str | None = None):
        """Initialize the local embedder.

        Args:
            model_name: Name of the sentence-transformers model to use.
                       Defaults to EMBEDDING_MODEL env var or all-MiniLM-L6-v2.
        """
        self.model_name = model_name or os.getenv("EMBEDDING_MODEL", DEFAULT_MODEL)
        logger.info("Loading sentence-transformers model: %s", self.model_name)
        self._model = SentenceTransformer(self.model_name)
        self._dimension = self._model.get_sentence_embedding_dimension()
        logger.info("Model loaded, dimension: %d", self._dimension)

    @property
    def dimension(self) -> int:
        """Return the embedding vector dimension."""
        return self._dimension

    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for the given text.

        Args:
            text: The text to embed.

        Returns:
            A list of floats representing the embedding vector.
        """
        # sentence-transformers is sync, but we wrap it for async compatibility
        embedding = self._model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts efficiently.

        sentence-transformers supports batch encoding which is faster
        than encoding one at a time.

        Args:
            texts: List of texts to embed.

        Returns:
            List of embedding vectors.
        """
        embeddings = self._model.encode(texts, convert_to_numpy=True)
        return [emb.tolist() for emb in embeddings]

