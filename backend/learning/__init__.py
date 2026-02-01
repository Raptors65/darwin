"""Self-improvement and learning modules."""

from learning.similar_fixes import get_similar_successful_fixes, format_similar_fixes
from learning.rules import (
    create_rule,
    get_rule,
    delete_rule,
    get_top_rules_for_product,
    list_all_rules_for_product,
    increment_rule_usage,
    format_rules_for_prompt,
    RULE_CATEGORIES,
)
from learning.rule_extractor import extract_rules_from_feedback

__all__ = [
    # Similar fixes
    "get_similar_successful_fixes",
    "format_similar_fixes",
    # Rules
    "create_rule",
    "get_rule",
    "delete_rule",
    "get_top_rules_for_product",
    "list_all_rules_for_product",
    "increment_rule_usage",
    "format_rules_for_prompt",
    "extract_rules_from_feedback",
    "RULE_CATEGORIES",
]

