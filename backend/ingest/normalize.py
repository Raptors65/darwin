"""Text normalization for deduplication."""

import re
import hashlib

# Pattern to match URLs
URL_PATTERN = re.compile(
    r"https?://[^\s<>\"{}|\\^`\[\]]+"
    r"|www\.[^\s<>\"{}|\\^`\[\]]+"
)

# Pattern to match most punctuation (keep apostrophes in contractions)
PUNCTUATION_PATTERN = re.compile(r"[^\w\s']|(?<!\w)'|'(?!\w)")

# Pattern to collapse multiple whitespace
WHITESPACE_PATTERN = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    """Normalize text for deduplication.

    Performs the following transformations:
    1. Convert to lowercase
    2. Strip URLs
    3. Remove punctuation (except apostrophes in contractions)
    4. Collapse multiple whitespace to single space
    5. Strip leading/trailing whitespace

    Args:
        text: The raw text to normalize.

    Returns:
        Normalized text string.
    """
    # Lowercase
    result = text.lower()

    # Strip URLs
    result = URL_PATTERN.sub(" ", result)

    # Remove punctuation
    result = PUNCTUATION_PATTERN.sub(" ", result)

    # Collapse whitespace
    result = WHITESPACE_PATTERN.sub(" ", result)

    # Strip
    return result.strip()


def compute_hash(text: str) -> str:
    """Compute SHA256 hash of text.

    Args:
        text: The text to hash (should be normalized first).

    Returns:
        Hex-encoded SHA256 hash.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_valid_signal(normalized_text: str, min_length: int = 10) -> bool:
    """Check if normalized text is valid for processing.

    Args:
        normalized_text: The normalized text to check.
        min_length: Minimum character length required.

    Returns:
        True if the text is valid, False otherwise.
    """
    return len(normalized_text) >= min_length

