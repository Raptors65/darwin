"""Embedding providers for text vectorization."""

from embedders.base import BaseEmbedder
from embedders.local import LocalEmbedder

# Registry of available embedders
_EMBEDDERS: dict[str, type[BaseEmbedder]] = {
    "local": LocalEmbedder,
}


def get_embedder(provider: str = "local", **kwargs) -> BaseEmbedder:
    """Factory function to get an embedder by provider name.

    Args:
        provider: Name of the embedding provider ("local", "openai", etc.)
        **kwargs: Additional arguments passed to the embedder constructor.

    Returns:
        An instance of the requested embedder.

    Raises:
        ValueError: If the provider is not registered.
    """
    if provider not in _EMBEDDERS:
        available = ", ".join(_EMBEDDERS.keys())
        raise ValueError(f"Unknown embedding provider: {provider}. Available: {available}")

    return _EMBEDDERS[provider](**kwargs)


def register_embedder(name: str, embedder_class: type[BaseEmbedder]) -> None:
    """Register a new embedder provider.

    Args:
        name: Name to register the embedder under.
        embedder_class: The embedder class to register.
    """
    _EMBEDDERS[name] = embedder_class


__all__ = ["BaseEmbedder", "LocalEmbedder", "get_embedder", "register_embedder"]

