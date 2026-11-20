import io
import unittest
from datetime import UTC, datetime
from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError

from nomad_sec_manager.github import (
    GitHubError,
    count_commits,
    fetch_repository,
    normalize_repository_url,
    request_github,
)

REPO = {
    "id": 42,
    "visibility": "public",
    "html_url": "https://github.com/Org/Renamed",
    "full_name": "Org/Renamed",
    "description": "A public project",
    "default_branch": "release/current",
    "language": "Python",
    "stargazers_count": 15,
    "archived": False,
}


class GitHubMetadataTests(unittest.TestCase):
    def test_public_repository_references(self):
        for reference in (
            "Org/Renamed",
            " github.com/Org/Renamed/ ",
            "https://github.com/Org/Renamed.git",
            "https://github.com/Org/Renamed?tab=readme-ov-file#setup",
        ):
            with self.subTest(reference=reference):
                self.assertEqual(normalize_repository_url(reference), REPO["html_url"])

        for reference in (
            "https://another.example/Org/Renamed",
            "https://github.com@another.example/Org/Renamed",
            "https://github.com/Org/Renamed/tree/main",
            "Org/..",
            "Org/%2e%2e",
        ):
            with self.subTest(reference=reference), self.assertRaises(ValueError):
                normalize_repository_url(reference)

    def test_default_branch_snapshot_uses_latest_commit_and_pagination(self):
        links = (
            '<https://api.github.com/repositories/42/commits?per_page=1&page=2>; rel="next", '
            '<https://api.github.com/repositories/42/commits?per_page=1&page=124>; rel="last"'
        )
        commits = [
            {
                "sha": "a" * 40,
                "commit": {
                    "committer": {"date": "2026-01-02T03:04:05Z"},
                    "message": "Fix release build\n\nBody of commit",
                },
            }
        ]
        with patch(
            "nomad_sec_manager.github.request_github",
            side_effect=[(REPO, ""), (commits, links)],
        ) as github:
            metadata = fetch_repository(42)

        github.assert_any_call("/repositories/42")
        github.assert_any_call(
            "/repos/Org/Renamed/commits?per_page=1&sha=release%2Fcurrent",
            allow_empty=True,
        )
        self.assertEqual(metadata.url, REPO["html_url"])
        self.assertEqual(metadata.commit_count, 124)
        self.assertEqual(metadata.last_commit_sha, "a" * 40)
        self.assertEqual(metadata.last_commit_subject, "Fix release build")
        self.assertEqual(
            metadata.last_commit_date, datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
        )

    def test_commit_counts_for_empty_and_partially_paginated_repositories(self):
        with patch(
            "nomad_sec_manager.github.request_github",
            side_effect=[(REPO, ""), ([], "")],
        ):
            metadata = fetch_repository(REPO["html_url"])
        self.assertEqual(metadata.commit_count, 0)
        self.assertIsNone(metadata.last_commit_sha)
        self.assertIsNone(metadata.last_commit_date)
        self.assertEqual(count_commits(""), 1)
        self.assertIsNone(count_commits('<https://api.github.com/?page=2>; rel="next"'))

    def test_empty_repository_and_rate_limit_responses(self):
        def error(status: int, headers: Message) -> HTTPError:
            return HTTPError(
                "https://api.github.com/", status, "", headers, io.BytesIO()
            )

        with patch("nomad_sec_manager.github.build_opener") as opener:
            opener.return_value.open.side_effect = error(409, Message())
            self.assertEqual(request_github("/test", allow_empty=True), ([], ""))

            headers = Message()
            headers["X-RateLimit-Remaining"] = "0"
            opener.return_value.open.side_effect = error(403, headers)
            with self.assertRaises(GitHubError) as raised:
                request_github("/test")
            self.assertEqual(raised.exception.status_code, 503)
