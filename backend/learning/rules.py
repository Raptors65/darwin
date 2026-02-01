"""Style rules storage and retrieval for self-improvement."""

import logging
import time
import uuid

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Valid rule categories
RULE_CATEGORIES = {"style", "convention", "workflow", "constraint"}


async def create_rule(
    redis_client: Redis,
    product: str,
    content: str,
    category: str,
    source: str = "manual",
    source_task_id: str | None = None,
    reviewer: str | None = None,
) -> str:
    """Create a new style rule for a product.
    
    Args:
        redis_client: Redis client.
        product: Product name (e.g., "joplin").
        content: The rule content (e.g., "Use early returns").
        category: One of: style, convention, workflow, constraint.
        source: Either "review_feedback" or "manual".
        source_task_id: Task ID if from review feedback.
        reviewer: Reviewer username if from review feedback.
        
    Returns:
        The rule ID.
    """
    if category not in RULE_CATEGORIES:
        raise ValueError(f"Invalid category: {category}. Must be one of {RULE_CATEGORIES}")
    
    rule_id = str(uuid.uuid4())[:8]
    key = f"rule:{product}:{rule_id}"
    now = int(time.time())
    
    rule_data = {
        "id": rule_id,
        "product": product,
        "content": content,
        "category": category,
        "source": source,
        "created_at": now,
        "times_applied": 0,
        "last_applied_at": 0,
    }
    
    if source_task_id:
        rule_data["source_task_id"] = source_task_id
    if reviewer:
        rule_data["reviewer"] = reviewer
    
    await redis_client.hset(key, mapping=rule_data)
    
    logger.info("Created rule %s for product %s: %s", rule_id, product, content[:50])
    return rule_id


async def get_rule(
    redis_client: Redis,
    product: str,
    rule_id: str,
) -> dict | None:
    """Get a single rule by ID.
    
    Args:
        redis_client: Redis client.
        product: Product name.
        rule_id: Rule ID.
        
    Returns:
        Rule dict or None if not found.
    """
    key = f"rule:{product}:{rule_id}"
    data = await redis_client.hgetall(key)
    
    if not data:
        return None
    
    return {
        k.decode() if isinstance(k, bytes) else k: 
        v.decode() if isinstance(v, bytes) else v 
        for k, v in data.items()
    }


async def delete_rule(
    redis_client: Redis,
    product: str,
    rule_id: str,
) -> bool:
    """Delete a rule.
    
    Args:
        redis_client: Redis client.
        product: Product name.
        rule_id: Rule ID.
        
    Returns:
        True if deleted, False if not found.
    """
    key = f"rule:{product}:{rule_id}"
    deleted = await redis_client.delete(key)
    
    if deleted:
        logger.info("Deleted rule %s for product %s", rule_id, product)
    
    return deleted > 0


async def get_top_rules_for_product(
    redis_client: Redis,
    product: str,
    limit: int = 10,
) -> list[dict]:
    """Get the top rules for a product, sorted by usage and recency.
    
    Rules are sorted by: times_applied DESC, created_at DESC
    
    Args:
        redis_client: Redis client.
        product: Product name.
        limit: Maximum number of rules to return.
        
    Returns:
        List of rule dicts.
    """
    # Get all rule keys for this product
    pattern = f"rule:{product}:*"
    keys = await redis_client.keys(pattern)
    
    if not keys:
        return []
    
    rules = []
    for key in keys:
        data = await redis_client.hgetall(key)
        if data:
            rule = {
                k.decode() if isinstance(k, bytes) else k: 
                v.decode() if isinstance(v, bytes) else v 
                for k, v in data.items()
            }
            # Convert numeric fields
            rule["times_applied"] = int(rule.get("times_applied", 0))
            rule["created_at"] = int(rule.get("created_at", 0))
            rule["last_applied_at"] = int(rule.get("last_applied_at", 0))
            rules.append(rule)
    
    # Sort by times_applied DESC, then created_at DESC
    rules.sort(key=lambda r: (r["times_applied"], r["created_at"]), reverse=True)
    
    return rules[:limit]


async def list_all_rules_for_product(
    redis_client: Redis,
    product: str,
) -> list[dict]:
    """Get all rules for a product (for admin UI).
    
    Args:
        redis_client: Redis client.
        product: Product name.
        
    Returns:
        List of all rule dicts, sorted by created_at DESC.
    """
    pattern = f"rule:{product}:*"
    keys = await redis_client.keys(pattern)
    
    if not keys:
        return []
    
    rules = []
    for key in keys:
        data = await redis_client.hgetall(key)
        if data:
            rule = {
                k.decode() if isinstance(k, bytes) else k: 
                v.decode() if isinstance(v, bytes) else v 
                for k, v in data.items()
            }
            rule["times_applied"] = int(rule.get("times_applied", 0))
            rule["created_at"] = int(rule.get("created_at", 0))
            rule["last_applied_at"] = int(rule.get("last_applied_at", 0))
            rules.append(rule)
    
    # Sort by created_at DESC (newest first)
    rules.sort(key=lambda r: r["created_at"], reverse=True)
    
    return rules


async def increment_rule_usage(
    redis_client: Redis,
    product: str,
    rule_id: str,
) -> None:
    """Increment the usage counter for a rule.
    
    Called when a rule is included in an agent prompt.
    
    Args:
        redis_client: Redis client.
        product: Product name.
        rule_id: Rule ID.
    """
    key = f"rule:{product}:{rule_id}"
    now = int(time.time())
    
    await redis_client.hincrby(key, "times_applied", 1)
    await redis_client.hset(key, "last_applied_at", now)


def format_rules_for_prompt(rules: list[dict]) -> str:
    """Format rules for inclusion in the agent prompt.
    
    Args:
        rules: List of rule dicts.
        
    Returns:
        Formatted markdown string.
    """
    if not rules:
        return "No style rules learned yet for this product."
    
    lines = []
    for i, rule in enumerate(rules, 1):
        content = rule.get("content", "")
        category = rule.get("category", "general")
        times_applied = rule.get("times_applied", 0)
        
        # Format: "1. Use early returns (style) [applied 3x]"
        usage_note = f"[applied {times_applied}x]" if times_applied > 0 else "[new]"
        lines.append(f"{i}. {content} ({category}) {usage_note}")
    
    return "\n".join(lines)

