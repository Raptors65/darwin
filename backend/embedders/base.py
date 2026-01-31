"""Base embedder protocol for extensibility."""

from abc import ABC, abstractmethod


class BaseEmbedder(ABC):
    """Abstract base class for text embedding providers.

    Implement this to add support for new embedding providers (OpenAI, Cohere, etc.).

    Example:
        class OpenAIEmbedder(BaseEmbedder):
            def __init__(self, model: str = "text-embedding-3-small"):
                self.model = model
                self.client = OpenAI()

            @property
            def dimension(self) -> int:
                return 1536  # for text-embedding-3-small

            async def embed(self, text: str) -> list[float]:
                response = await self.client.embeddings.create(
                    model=self.model,
                    input=text,
                )
                return response.data[0].embedding
    """

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return the embedding vector dimension."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for the given text.

        Args:
            text: The text to embed.

        Returns:
            A list of floats representing the embedding vector.
        """

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Default implementation calls embed() for each text.
        Override for batch-optimized implementations.

        Args:
            texts: List of texts to embed.

        Returns:
            List of embedding vectors.
        """
        return [await self.embed(text) for text in texts]

