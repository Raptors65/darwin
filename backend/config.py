"""Configuration and product-to-repo mapping."""

import json
import logging
import os

logger = logging.getLogger(__name__)

# Default product-to-repo mapping
# Can be overridden by PRODUCT_REPOS environment variable
_DEFAULT_PRODUCT_REPOS: dict[str, str] = {
    # Example mappings - override with PRODUCT_REPOS env var
    # "joplin": "joplin/joplin",
    # "obsidian": "obsidianmd/obsidian-releases",
}

_product_repos: dict[str, str] | None = None


def get_product_repos() -> dict[str, str]:
    """Get the product-to-repo mapping.

    Loads from PRODUCT_REPOS environment variable (JSON format) if set,
    otherwise returns the default mapping.

    Returns:
        Dictionary mapping product names to GitHub repos.
    """
    global _product_repos

    if _product_repos is not None:
        return _product_repos

    env_value = os.getenv("PRODUCT_REPOS")
    if env_value:
        try:
            _product_repos = json.loads(env_value)
            logger.info("Loaded %d product-repo mappings from env", len(_product_repos))
        except json.JSONDecodeError as e:
            logger.error("Failed to parse PRODUCT_REPOS: %s", e)
            _product_repos = _DEFAULT_PRODUCT_REPOS
    else:
        _product_repos = _DEFAULT_PRODUCT_REPOS.copy()

    return _product_repos


def get_repo_for_product(product: str) -> str | None:
    """Get the GitHub repo for a product.

    Args:
        product: Product name (case-insensitive).

    Returns:
        GitHub repo in "owner/repo" format, or None if not mapped.
    """
    repos = get_product_repos()
    # Case-insensitive lookup
    product_lower = product.lower()
    for key, repo in repos.items():
        if key.lower() == product_lower:
            return repo
    return None


def set_product_repo(product: str, repo: str) -> None:
    """Set the repo mapping for a product.

    Args:
        product: Product name.
        repo: GitHub repo in "owner/repo" format.
    """
    repos = get_product_repos()
    repos[product] = repo
    logger.info("Set repo for %s: %s", product, repo)


def clear_product_repos_cache() -> None:
    """Clear the product repos cache (for testing)."""
    global _product_repos
    _product_repos = None

