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


@dataclass
class PRReviewComment:
    """A review comment on a pull request (inline code comment)."""

    id: int
    body: str
    path: str  # File path the comment is on
    line: int | None  # Line number (None if outdated)
    side: str  # "LEFT" or "RIGHT"
    user: str  # Username of commenter
    created_at: str
    html_url: str


@dataclass
class PRReview:
    """A pull request review."""

    id: int
    body: str  # Review summary comment
    state: str  # "APPROVED", "CHANGES_REQUESTED", "COMMENTED", "PENDING"
    user: str  # Username of reviewer
    submitted_at: str | None
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

    async def get_pr_reviews(self, repo: str, pr_number: int) -> list[PRReview]:
        """Fetch all reviews for a pull request.

        Args:
            repo: Repository in "owner/repo" format.
            pr_number: Pull request number.

        Returns:
            List of PRReview objects.
        """
        url = f"{GITHUB_API_URL}/repos/{repo}/pulls/{pr_number}/reviews"

        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        logger.info("Fetching reviews for %s PR #%d", repo, pr_number)

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            data = response.json()

        reviews = []
        for review in data:
            reviews.append(
                PRReview(
                    id=review["id"],
                    body=review.get("body", "") or "",
                    state=review["state"],
                    user=review["user"]["login"],
                    submitted_at=review.get("submitted_at"),
                    html_url=review["html_url"],
                )
            )

        logger.info("Fetched %d reviews for PR #%d", len(reviews), pr_number)
        return reviews

    async def get_pr_comments(self, repo: str, pr_number: int) -> list[PRReviewComment]:
        """Fetch all review comments (inline code comments) for a pull request.

        Args:
            repo: Repository in "owner/repo" format.
            pr_number: Pull request number.

        Returns:
            List of PRReviewComment objects with file/line context.
        """
        url = f"{GITHUB_API_URL}/repos/{repo}/pulls/{pr_number}/comments"

        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        logger.info("Fetching review comments for %s PR #%d", repo, pr_number)

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            data = response.json()

        comments = []
        for comment in data:
            comments.append(
                PRReviewComment(
                    id=comment["id"],
                    body=comment["body"],
                    path=comment["path"],
                    line=comment.get("line"),  # Can be None for outdated comments
                    side=comment.get("side", "RIGHT"),
                    user=comment["user"]["login"],
                    created_at=comment["created_at"],
                    html_url=comment["html_url"],
                )
            )

        logger.info("Fetched %d review comments for PR #%d", len(comments), pr_number)
        return comments


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

