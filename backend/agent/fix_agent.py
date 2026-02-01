"""Coding fix agent using Claude Agent SDK."""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import weave
from claude_agent_sdk import query, ClaudeAgentOptions

logger = logging.getLogger(__name__)

# Track whether Weave has been initialized
_weave_initialized = False


def init_weave() -> bool:
    """Initialize Weave if WANDB_API_KEY is set.
    
    Uses WEAVE_PROJECT env var for project name (default: darwin-agent).
    Format should be "team/project" or just "project" (uses default team).
    
    Returns:
        True if Weave was initialized, False otherwise.
    """
    global _weave_initialized
    if _weave_initialized:
        return True
    
    if os.getenv("WANDB_API_KEY"):
        project_name = os.getenv("WEAVE_PROJECT", "darwin-agent")
        try:
            weave.init(project_name)
            _weave_initialized = True
            logger.info("Weave initialized for project: %s", project_name)
            return True
        except Exception as e:
            logger.warning("Failed to initialize Weave: %s", e)
            return False
    else:
        logger.debug("WANDB_API_KEY not set, Weave tracing disabled")
        return False


@weave.op()
def log_tool_call(tool_name: str, tool_input: dict) -> dict:
    """Log a tool call as a Weave child span.
    
    This creates a nested span in the Weave trace for each tool the agent uses.
    
    Args:
        tool_name: Name of the tool (Read, Edit, Glob, Grep, Bash, etc.)
        tool_input: Input parameters passed to the tool.
        
    Returns:
        A dict summarizing the tool call for the trace.
    """
    # Create a concise summary based on tool type
    summary = ""
    if tool_name == "Read":
        summary = tool_input.get("file_path", "unknown file")
    elif tool_name == "Edit":
        summary = tool_input.get("file_path", "unknown file")
    elif tool_name == "Glob":
        summary = tool_input.get("pattern", "unknown pattern")
    elif tool_name == "Grep":
        summary = tool_input.get("pattern", "unknown pattern")
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        summary = cmd[:100] + "..." if len(cmd) > 100 else cmd
    else:
        summary = str(tool_input)[:100]
    
    logger.info("[Agent] %s: %s", tool_name, summary)
    
    return {
        "tool": tool_name,
        "summary": summary,
        "input": tool_input,
    }

# Prompt template for the fix agent
FIX_AGENT_PROMPT = """You are a skilled software engineer fixing a bug or implementing a feature.

## Task Information
- **Category**: {category}
- **Title**: {title}
- **Summary**: {summary}
- **Suggested Action**: {suggested_action}

## Coding Style Rules for {product}
These rules were learned from past code reviews. Follow them when making changes:

{style_rules}

## Similar Past Fixes (Learn from these!)
{similar_fixes}

## Instructions

1. **Follow Style Rules**: Review the coding style rules above and apply them to your changes.
2. **Review Past Fixes**: Look at similar fixes for patterns and guidance.
3. **Explore**: Understand the codebase structure. Use Glob and Grep to find relevant files.
4. **Analyze**: Read the relevant files to understand the current implementation.
5. **Plan**: Think about the minimal changes needed, following style rules and patterns.
6. **Fix**: Make the necessary code changes using Edit. Keep changes focused and minimal.
7. **Verify**: Review your changes to ensure they address the issue and follow the rules.

## Guidelines

- Make minimal, targeted changes
- Follow the existing code style and conventions
- Follow the style rules listed above - they come from real code reviews!
- Add comments if the fix is non-obvious
- Do NOT run tests or commit - just make the file changes
- If you're unsure about something, err on the side of making a smaller change
- If similar fixes exist, consider following the same patterns

Begin by exploring the codebase to find the relevant code for this issue.
"""

# Prompt template for addressing PR review feedback
FIX_FEEDBACK_PROMPT = """You are a skilled software engineer addressing code review feedback on a pull request.

## Original Task Information
- **Category**: {category}
- **Title**: {title}
- **Summary**: {summary}

## Review Feedback to Address

A human reviewer has requested changes to your pull request. Here is their feedback:

### Review Comments
{review_comments}

### Inline Code Comments
{inline_comments}

## Instructions

1. **Read the feedback carefully**: Understand what the reviewer is asking for.
2. **Locate the relevant code**: Use Grep/Glob to find the files mentioned in the feedback.
3. **Make the requested changes**: Address each piece of feedback.
4. **Be thorough**: Make sure you address ALL comments, not just some of them.

## Guidelines

- Address ALL feedback from the reviewer
- Keep changes focused on what was requested
- Follow the existing code style and conventions
- If a comment is unclear, make your best effort to address it
- Do NOT run tests or commit - just make the file changes

Begin by reading the files mentioned in the review comments.
"""


@dataclass
class FixResult:
    """Result of running the fix agent."""

    success: bool
    message: str
    files_changed: list[str]
    error: str | None = None


@weave.op()
async def run_fix_agent(
    repo_path: Path,
    task: dict,
    similar_fixes_text: str = "",
    style_rules_text: str = "",
) -> FixResult:
    """Run the Claude Agent to fix an issue in a repository.

    Args:
        repo_path: Path to the cloned repository.
        task: Task data dictionary with category, title, summary, suggested_action.
        similar_fixes_text: Pre-formatted text of similar successful fixes.
        style_rules_text: Pre-formatted text of style rules for this product.

    Returns:
        FixResult with the outcome.
    """
    category = task.get("category", "UNKNOWN")
    title = task.get("title", "")
    summary = task.get("summary", "")
    suggested_action = task.get("suggested_action", "")
    product = task.get("product", "this project")

    # Use provided similar fixes or default message
    if not similar_fixes_text:
        similar_fixes_text = "No similar past fixes found yet. You're pioneering new territory!"
    
    # Use provided style rules or default message
    if not style_rules_text:
        style_rules_text = "No style rules learned yet for this product."

    prompt = FIX_AGENT_PROMPT.format(
        category=category,
        title=title,
        summary=summary,
        suggested_action=suggested_action,
        product=product,
        style_rules=style_rules_text,
        similar_fixes=similar_fixes_text,
    )

    logger.info("Running fix agent for task: %s", title[:50])
    logger.info("Working directory: %s", repo_path)

    files_changed: list[str] = []
    last_result = ""

    try:
        async for message in query(
            prompt=prompt,
            options=ClaudeAgentOptions(
                cwd=str(repo_path),
                allowed_tools=["Read", "Edit", "Glob", "Grep", "Bash"],
                permission_mode="acceptEdits",  # Auto-accept file edits
            ),
        ):
            # Log the message class for debugging
            msg_class = type(message).__name__
            logger.debug("Agent message: %s", msg_class)

            # Handle AssistantMessage with ToolUseBlock in content
            # Structure: AssistantMessage(content=[ToolUseBlock(name='Read', input={...})])
            if hasattr(message, "content") and isinstance(message.content, list):
                for block in message.content:
                    # Check if this is a ToolUseBlock
                    block_type = type(block).__name__
                    if block_type == "ToolUseBlock":
                        tool_name = getattr(block, "name", None)
                        tool_input = getattr(block, "input", {}) or {}
                        
                        if tool_name:
                            # Create a Weave child span for this tool call
                            log_tool_call(tool_name, tool_input)
                            
                            # Track file changes from Edit tool
                            if tool_name == "Edit":
                                file_path = tool_input.get("file_path", "")
                                if file_path:
                                    # Convert to relative path if it starts with repo_path
                                    # Use resolve() to handle macOS /var -> /private/var symlink
                                    try:
                                        resolved_file = Path(file_path).resolve()
                                        resolved_repo = repo_path.resolve()
                                        rel_path = str(resolved_file.relative_to(resolved_repo))
                                    except ValueError:
                                        # Already relative or different base
                                        rel_path = file_path
                                    
                                    if rel_path not in files_changed:
                                        files_changed.append(rel_path)
                                        logger.info("File changed: %s", rel_path)

            # Capture final result from ResultMessage
            if hasattr(message, "result"):
                last_result = message.result

        logger.info("Fix agent completed. Files changed: %d", len(files_changed))

        if files_changed:
            return FixResult(
                success=True,
                message=last_result or f"Fixed {len(files_changed)} file(s)",
                files_changed=files_changed,
            )
        else:
            return FixResult(
                success=False,
                message="Agent completed but no files were changed",
                files_changed=[],
            )

    except Exception as e:
        logger.exception("Fix agent failed: %s", e)
        return FixResult(
            success=False,
            message="Agent failed",
            files_changed=files_changed,
            error=str(e),
        )


def format_review_comments(reviews: list[dict], inline_comments: list[dict]) -> tuple[str, str]:
    """Format review comments for the feedback prompt.

    Args:
        reviews: List of review dicts with 'body', 'user', 'state' fields.
        inline_comments: List of comment dicts with 'body', 'path', 'line', 'user' fields.

    Returns:
        Tuple of (review_comments_text, inline_comments_text).
    """
    # Format review-level comments
    review_text_parts = []
    for review in reviews:
        if review.get("body"):
            review_text_parts.append(
                f"**{review.get('user', 'Reviewer')}** ({review.get('state', 'COMMENTED')}):\n{review['body']}"
            )

    review_text = "\n\n".join(review_text_parts) if review_text_parts else "No review-level comments."

    # Format inline comments with file/line context
    inline_text_parts = []
    for comment in inline_comments:
        path = comment.get("path", "unknown file")
        line = comment.get("line")
        user = comment.get("user", "Reviewer")
        body = comment.get("body", "")

        if line:
            inline_text_parts.append(f"**{path}:{line}** ({user}):\n{body}")
        else:
            inline_text_parts.append(f"**{path}** ({user}):\n{body}")

    inline_text = "\n\n".join(inline_text_parts) if inline_text_parts else "No inline code comments."

    return review_text, inline_text


@weave.op()
async def run_feedback_fix_agent(
    repo_path: Path,
    task: dict,
    reviews: list[dict],
    inline_comments: list[dict],
) -> FixResult:
    """Run the Claude Agent to address PR review feedback.

    Args:
        repo_path: Path to the cloned repository (on the PR branch).
        task: Original task data dictionary.
        reviews: List of PR reviews with 'body', 'user', 'state' fields.
        inline_comments: List of inline comments with 'body', 'path', 'line', 'user' fields.

    Returns:
        FixResult with the outcome.
    """
    category = task.get("category", "UNKNOWN")
    title = task.get("title", "")
    summary = task.get("summary", "")

    # Format the review feedback
    review_text, inline_text = format_review_comments(reviews, inline_comments)

    prompt = FIX_FEEDBACK_PROMPT.format(
        category=category,
        title=title,
        summary=summary,
        review_comments=review_text,
        inline_comments=inline_text,
    )

    logger.info("Running feedback fix agent for task: %s", title[:50])
    logger.info("Reviews: %d, Inline comments: %d", len(reviews), len(inline_comments))
    logger.info("Working directory: %s", repo_path)

    files_changed: list[str] = []
    last_result = ""

    try:
        async for message in query(
            prompt=prompt,
            options=ClaudeAgentOptions(
                cwd=str(repo_path),
                allowed_tools=["Read", "Edit", "Glob", "Grep", "Bash"],
                permission_mode="acceptEdits",  # Auto-accept file edits
            ),
        ):
            # Log the message class for debugging
            msg_class = type(message).__name__
            logger.debug("Agent message: %s", msg_class)

            # Handle AssistantMessage with ToolUseBlock in content
            if hasattr(message, "content") and isinstance(message.content, list):
                for block in message.content:
                    block_type = type(block).__name__
                    if block_type == "ToolUseBlock":
                        tool_name = getattr(block, "name", None)
                        tool_input = getattr(block, "input", {}) or {}

                        if tool_name:
                            log_tool_call(tool_name, tool_input)

                            # Track file changes from Edit tool
                            if tool_name == "Edit":
                                file_path = tool_input.get("file_path", "")
                                if file_path:
                                    try:
                                        resolved_file = Path(file_path).resolve()
                                        resolved_repo = repo_path.resolve()
                                        rel_path = str(resolved_file.relative_to(resolved_repo))
                                    except ValueError:
                                        rel_path = file_path

                                    if rel_path not in files_changed:
                                        files_changed.append(rel_path)
                                        logger.info("File changed: %s", rel_path)

            # Capture final result from ResultMessage
            if hasattr(message, "result"):
                last_result = message.result

        logger.info("Feedback fix agent completed. Files changed: %d", len(files_changed))

        if files_changed:
            return FixResult(
                success=True,
                message=last_result or f"Addressed feedback in {len(files_changed)} file(s)",
                files_changed=files_changed,
            )
        else:
            return FixResult(
                success=False,
                message="Agent completed but no files were changed",
                files_changed=[],
            )

    except Exception as e:
        logger.exception("Feedback fix agent failed: %s", e)
        return FixResult(
            success=False,
            message="Agent failed",
            files_changed=files_changed,
            error=str(e),
        )

