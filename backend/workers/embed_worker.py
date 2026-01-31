"""Background worker for embedding and clustering signals."""

import asyncio
import logging
import os

import redis.asyncio as redis

from embedders import get_embedder
from embedders.base import BaseEmbedder
from ingest.cluster import cluster_signal
from ingest.dedupe import get_signal, pop_embed_queue, get_embed_queue_length

logger = logging.getLogger(__name__)

# Worker configuration
POLL_INTERVAL = float(os.getenv("EMBED_WORKER_POLL_INTERVAL", "1.0"))
BATCH_SIZE = int(os.getenv("EMBED_WORKER_BATCH_SIZE", "10"))


class EmbedWorker:
    """Background worker that processes the embedding queue.

    This worker:
    1. Pops signal hashes from queue:to-embed
    2. Fetches the signal data from Redis
    3. Generates embeddings using the configured embedder
    4. Clusters the signal into existing or new topics
    """

    def __init__(
        self,
        redis_client: redis.Redis,
        embedder: BaseEmbedder | None = None,
    ):
        """Initialize the embed worker.

        Args:
            redis_client: Redis client instance.
            embedder: Embedder to use. Defaults to configured provider.
        """
        self.redis = redis_client
        self.embedder = embedder or get_embedder(
            os.getenv("EMBEDDING_PROVIDER", "local")
        )
        self._running = False
        self._task: asyncio.Task | None = None

    async def process_one(self) -> bool:
        """Process a single signal from the queue.

        Returns:
            True if a signal was processed, False if queue was empty.
        """
        # Pop from queue
        signal_hash = await pop_embed_queue(self.redis)
        if not signal_hash:
            return False

        logger.debug("Processing signal: %s", signal_hash[:16])

        # Get signal data
        signal_data = await get_signal(self.redis, signal_hash)
        if not signal_data:
            logger.warning("Signal not found in Redis: %s", signal_hash[:16])
            return True

        # Get the normalized text for embedding
        text = signal_data.get("normalized", signal_data.get("text", ""))
        if not text:
            logger.warning("Signal has no text: %s", signal_hash[:16])
            return True

        # Generate embedding
        try:
            embedding = await self.embedder.embed(text)
        except Exception as e:
            logger.error("Failed to embed signal %s: %s", signal_hash[:16], e)
            # Could re-queue here for retry
            return True

        # Cluster the signal
        try:
            result = await cluster_signal(
                self.redis,
                signal_hash,
                text,
                embedding,
            )
            logger.info(
                "Clustered signal %s: action=%s, topic=%s, similarity=%.3f",
                signal_hash[:16],
                result.action,
                result.topic_id,
                result.similarity or 0,
            )
        except Exception as e:
            logger.error("Failed to cluster signal %s: %s", signal_hash[:16], e)

        return True

    async def process_batch(self, batch_size: int = BATCH_SIZE) -> int:
        """Process a batch of signals.

        Args:
            batch_size: Maximum signals to process in this batch.

        Returns:
            Number of signals processed.
        """
        processed = 0
        for _ in range(batch_size):
            if await self.process_one():
                processed += 1
            else:
                break
        return processed

    async def run(self) -> None:
        """Run the worker loop."""
        self._running = True
        logger.info("Embed worker started")

        while self._running:
            try:
                queue_len = await get_embed_queue_length(self.redis)
                if queue_len > 0:
                    logger.debug("Queue length: %d", queue_len)
                    processed = await self.process_batch()
                    if processed > 0:
                        logger.info("Processed %d signals", processed)
                else:
                    await asyncio.sleep(POLL_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Error in embed worker: %s", e)
                await asyncio.sleep(POLL_INTERVAL)

        logger.info("Embed worker stopped")

    def start(self) -> asyncio.Task:
        """Start the worker as a background task.

        Returns:
            The asyncio Task running the worker.
        """
        self._task = asyncio.create_task(self.run())
        return self._task

    async def stop(self) -> None:
        """Stop the worker."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
