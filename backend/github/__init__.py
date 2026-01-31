"""GitHub integration module."""

from github.client import GitHubClient, create_github_issue
from github.issue_formatter import (
    format_issue_body,
    format_issue_title,
    get_labels_for_task,
)

__all__ = [
    "GitHubClient",
    "create_github_issue",
    "format_issue_body",
    "format_issue_title",
    "get_labels_for_task",
]

