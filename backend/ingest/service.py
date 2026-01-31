"""Ingest service orchestrating the pipeline."""

import logging
from dataclasses import dataclass

import redis.asyncio as redis

from ingest.dedupe import DedupeResult, check_and_store_signal
from models import Signal

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    """Result of ingesting a single signal."""

    signal_id: str
    signal_hash: str
    status: str  # "queued", "duplicate", "invalid"


@dataclass
class BatchIngestResult:
    """Result of ingesting a batch of signals."""

    total: int
    queued: int
    duplicates: int
    invalid: int
    results: list[IngestResult]


class IngestService:
    """Service for ingesting signals into the pipeline.

    This service handles the first stage of the pipeline:
    1. Normalize text
    2. Check for duplicates (SHA256 hash)
    3. Store new signals in Redis
    4. Queue signals for embedding
    """

    def __init__(self, redis_client: redis.Redis):
        """Initialize the ingest service.

        Args:
            redis_client: Redis client instance.
        """
        self.redis = redis_client

    async def ingest_signal(self, signal: Signal) -> IngestResult:
        """Ingest a single signal.

        Args:
            signal: The signal to ingest.

        Returns:
            IngestResult with the status.
        """
        result: DedupeResult = await check_and_store_signal(self.redis, signal)

        if not result.is_valid:
            return IngestResult(
                signal_id=signal.id,
                signal_hash="",
                status="invalid",
            )

        if result.is_duplicate:
            return IngestResult(
                signal_id=signal.id,
                signal_hash=result.signal_hash,
                status="duplicate",
            )

        return IngestResult(
            signal_id=signal.id,
            signal_hash=result.signal_hash,
            status="queued",
        )

    async def ingest_batch(self, signals: list[Signal]) -> BatchIngestResult:
        """Ingest a batch of signals.

        Args:
            signals: List of signals to ingest.

        Returns:
            BatchIngestResult with aggregated stats.
        """
        results = []
        queued = 0
        duplicates = 0
        invalid = 0

        for signal in signals:
            result = await self.ingest_signal(signal)
            results.append(result)

            if result.status == "queued":
                queued += 1
            elif result.status == "duplicate":
                duplicates += 1
            else:
                invalid += 1

        logger.info(
            "Batch ingest complete: %d total, %d queued, %d duplicates, %d invalid",
            len(signals),
            queued,
            duplicates,
            invalid,
        )

        return BatchIngestResult(
            total=len(signals),
            queued=queued,
            duplicates=duplicates,
            invalid=invalid,
            results=results,
        )

