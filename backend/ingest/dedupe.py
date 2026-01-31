"""Deduplication logic using SHA256 hashing and Redis."""

import logging
import time
from dataclasses import dataclass

import redis.asyncio as redis

from ingest.normalize import compute_hash, is_valid_signal, normalize_text
from models import Signal

logger = logging.getLogger(__name__)

# Redis key prefixes
SIGNAL_PREFIX = "signal:"
EMBED_QUEUE = "queue:to-embed"


@dataclass
class DedupeResult:
    """Result of deduplication check."""

    signal_hash: str
    is_duplicate: bool
    normalized_text: str
    is_valid: bool


async def check_and_store_signal(
    client: redis.Redis,
    signal: Signal,
) -> DedupeResult:
    """Check if signal is duplicate and store if new.

    Args:
        client: Redis client.
        signal: The signal to check and store.

    Returns:
        DedupeResult with deduplication status.
    """
    # Normalize the text
    normalized = normalize_text(signal.text)

    # Check validity
    if not is_valid_signal(normalized):
        logger.debug("Signal too short after normalization: %s", signal.id)
        return DedupeResult(
            signal_hash="",
            is_duplicate=False,
            normalized_text=normalized,
            is_valid=False,
        )

    # Compute hash
    signal_hash = compute_hash(normalized)
    key = f"{SIGNAL_PREFIX}{signal_hash}"

    # Check if exists
    exists = await client.exists(key)

    if exists:
        # Update last_seen timestamp
        await client.hset(key, "last_seen", int(time.time()))
        logger.debug("Duplicate signal found: %s", signal_hash[:16])
        return DedupeResult(
            signal_hash=signal_hash,
            is_duplicate=True,
            normalized_text=normalized,
            is_valid=True,
        )

    # Store new signal
    now = int(time.time())
    await client.hset(
        key,
        mapping={
            "text": signal.text,
            "normalized": normalized,
            "source": signal.source,
            "url": signal.url,
            "title": signal.title or "",
            "author": signal.author or "",
            "product": signal.product or "",
            "first_seen": now,
            "last_seen": now,
            "topic_id": "",  # Will be set after clustering
        },
    )

    # Push to embedding queue
    await client.rpush(EMBED_QUEUE, signal_hash)
    logger.info("New signal stored: %s, queued for embedding", signal_hash[:16])

    return DedupeResult(
        signal_hash=signal_hash,
        is_duplicate=False,
        normalized_text=normalized,
        is_valid=True,
    )


async def get_signal(client: redis.Redis, signal_hash: str) -> dict | None:
    """Get a signal by hash.

    Args:
        client: Redis client.
        signal_hash: The signal hash.

    Returns:
        Signal data dict or None if not found.
    """
    key = f"{SIGNAL_PREFIX}{signal_hash}"
    data = await client.hgetall(key)
    return data if data else None


async def update_signal_topic(
    client: redis.Redis,
    signal_hash: str,
    topic_id: str,
) -> None:
    """Update the topic_id for a signal.

    Args:
        client: Redis client.
        signal_hash: The signal hash.
        topic_id: The topic ID to associate with.
    """
    key = f"{SIGNAL_PREFIX}{signal_hash}"
    await client.hset(key, "topic_id", topic_id)


async def pop_embed_queue(client: redis.Redis) -> str | None:
    """Pop a signal hash from the embedding queue.

    Args:
        client: Redis client.

    Returns:
        Signal hash or None if queue is empty.
    """
    result = await client.lpop(EMBED_QUEUE)
    return result


async def get_embed_queue_length(client: redis.Redis) -> int:
    """Get the length of the embedding queue.

    Args:
        client: Redis client.

    Returns:
        Queue length.
    """
    return await client.llen(EMBED_QUEUE)
