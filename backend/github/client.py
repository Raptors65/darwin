"""GitHub API client for creating issues."""

import logging
import os
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"


@dataclass
class GitHubIssue:
    """Result of creating a GitHub issue."""

    number: int
    url: str
    html_url: str


class GitHubClient:
    """Client for interacting with the GitHub API."""

    def __init__(self, token: str | None = None):
        """Initialize the GitHub client.

        Args:
            token: GitHub personal access token. Defaults to GITHUB_TOKEN env var.
        """
        self._token = token or os.getenv("GITHUB_TOKEN")
        if not self._token:
            raise ValueError(
                "GitHub token not provided. Set GITHUB_TOKEN environment variable."
            )

    async def create_issue(
        self,
        repo: str,
        title: str,
        body: str,
        labels: list[str] | None = None,
    ) -> GitHubIssue:
        """Create a new issue in a GitHub repository.

        Args:
            repo: Repository in "owner/repo" format.
            title: Issue title.
            body: Issue body (markdown).
            labels: Optional list of label names to apply.

        Returns:
            GitHubIssue with the created issue details.

        Raises:
            httpx.HTTPStatusError: If the API request fails.
        """
        url = f"{GITHUB_API_URL}/repos/{repo}/issues"

        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        payload = {
            "title": title,
            "body": body,
        }

        if labels:
            payload["labels"] = labels

        logger.info("Creating issue in %s: %s", repo, title[:50])

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

        issue = GitHubIssue(
            number=data["number"],
            url=data["url"],
            html_url=data["html_url"],
        )

        logger.info("Created issue #%d: %s", issue.number, issue.html_url)
        return issue


# Convenience function for quick issue creation
async def create_github_issue(
    repo: str,
    title: str,
    body: str,
    labels: list[str] | None = None,
    token: str | None = None,
) -> GitHubIssue:
    """Create a GitHub issue using the default client.

    Args:
        repo: Repository in "owner/repo" format.
        title: Issue title.
        body: Issue body (markdown).
        labels: Optional list of label names.
        token: Optional GitHub token (uses env var if not provided).

    Returns:
        GitHubIssue with the created issue details.
    """
    client = GitHubClient(token=token)
    return await client.create_issue(repo, title, body, labels)

