"""Extract actionable rules from code review feedback using LLM."""

import json
import logging
import os

from llm import get_llm

logger = logging.getLogger(__name__)

RULE_EXTRACTION_PROMPT = """You are analyzing code review feedback to extract generalizable coding rules.

Given this code review feedback:
"{feedback}"

Extract actionable coding style rules that should be remembered for future fixes on this codebase.

Only extract rules that are:
1. **Generalizable** - Apply broadly, not just to this specific change
2. **Actionable** - Clear what the developer should do
3. **About code quality** - Style, conventions, patterns, or constraints

Categories:
- **style**: Code formatting, naming, structure preferences
- **convention**: Project-specific patterns or practices
- **workflow**: Process or tooling preferences
- **constraint**: Things to avoid or limitations

Return a JSON object with this structure:
{{"rules": [{{"content": "rule description", "category": "style|convention|workflow|constraint"}}]}}

If the feedback is too specific to extract generalizable rules, return: {{"rules": []}}

Examples of GOOD rules to extract:
- "Use early returns instead of nested conditionals"
- "Add JSDoc comments to exported functions"
- "Use async/await instead of .then() chains"
- "Keep functions under 50 lines"

Examples of feedback that should NOT become rules:
- "Fix the typo on line 42" (too specific)
- "This function should return null" (task-specific)

Return ONLY the JSON object, no additional text."""


async def extract_rules_from_feedback(
    feedback: str,
    task_context: dict | None = None,
) -> list[dict]:
    """Extract generalizable rules from code review feedback.
    
    Uses an LLM to analyze the feedback and extract rules that can be
    applied to future fixes.
    
    Args:
        feedback: The review feedback text.
        task_context: Optional context about the task (category, title, etc.)
        
    Returns:
        List of rule dicts with 'content' and 'category' keys.
    """
    if not feedback or len(feedback.strip()) < 10:
        logger.debug("Feedback too short to extract rules")
        return []
    
    try:
        # Get LLM provider from environment
        provider = os.getenv("LLM_PROVIDER", "openai")
        model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        
        llm = get_llm(provider, model=model)
        
        # Format the prompt
        prompt = RULE_EXTRACTION_PROMPT.format(feedback=feedback[:2000])  # Limit length
        
        # Call LLM with the complete method
        response = await llm.complete(prompt)
        
        # Extract content from response
        content = response.get("content", "")
        if not content:
            # If schema was used, response might be the result directly
            content = str(response)
        
        # Parse JSON response
        # Try to find JSON in the response (in case there's extra text)
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        
        if json_start == -1 or json_end == 0:
            logger.warning("No JSON found in LLM response for rule extraction")
            return []
        
        json_str = content[json_start:json_end]
        result = json.loads(json_str)
        
        rules = result.get("rules", [])
        
        # Validate rules
        valid_rules = []
        valid_categories = {"style", "convention", "workflow", "constraint"}
        
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            content = rule.get("content", "").strip()
            category = rule.get("category", "").lower().strip()
            
            if not content:
                continue
            if category not in valid_categories:
                category = "convention"  # Default category
            
            valid_rules.append({
                "content": content,
                "category": category,
            })
        
        logger.info("Extracted %d rules from feedback", len(valid_rules))
        return valid_rules
        
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse JSON from LLM response: %s", e)
        return []
    except Exception as e:
        logger.error("Failed to extract rules from feedback: %s", e)
        return []

