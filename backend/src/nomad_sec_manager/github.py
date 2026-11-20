import json
import re
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from pydantic import BaseModel

GITHUB_API = "https://api.github.com"
REPOSITORY_URL = "https://github.com/"
REPOSITORY_REFERENCE = re.compile(
    r"(?:(?:https?://)?github\.com/)?([a-z0-9-]+)/([a-z0-9_.-]+)/?"
    r"(?:\?[^\s#]*)?(?:#[^\s]*)?",
    re.IGNORECASE | re.ASCII,
)


class GitHubError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class RepositoryMetadata(BaseModel):
    github_id: int
    url: str
    full_name: str
    description: str | None
    default_branch: str
    language: str | None
    stars: int
    archived: bool
    commit_count: int | None
    last_commit_sha: str | None
    last_commit_date: datetime | None
    last_commit_subject: str | None


def normalize_repository_url(reference: str) -> str:
    match = REPOSITORY_REFERENCE.fullmatch(reference.strip())
    if match:
        owner, name = match.groups()
        if name.lower().endswith(".git"):
            name = name[:-4]
        if name and name not in {".", ".."}:
            return f"{REPOSITORY_URL}{owner}/{name}"
    raise ValueError("Enter a GitHub repository URL or owner/repository.")


class GitHubRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith(f"{GITHUB_API}/"):
            raise GitHubError(502, "GitHub returned an unexpected redirect.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def request_github(path: str, *, allow_empty: bool = False):
    request = Request(
        f"{GITHUB_API}{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "nomad-sec-manager",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with build_opener(GitHubRedirectHandler()).open(
            request, timeout=10
        ) as response:
            return json.load(response), response.headers.get("Link", "")
    except HTTPError as error:
        error.close()
        if error.code == 409 and allow_empty:
            return [], ""
        if error.code == 404:
            raise GitHubError(404, "Public GitHub repository not found.") from error
        if error.code == 429 or (
            error.code == 403
            and (
                error.headers.get("X-RateLimit-Remaining") == "0"
                or error.headers.get("Retry-After")
            )
        ):
            raise GitHubError(
                503, "GitHub rate limit reached. Try again later."
            ) from error
        if error.code == 403:
            raise GitHubError(
                403, "GitHub denied access to this repository."
            ) from error
        raise GitHubError(
            502, "GitHub could not return repository metadata."
        ) from error
    except (URLError, OSError, ValueError) as error:
        raise GitHubError(502, "Could not read the GitHub response.") from error


def count_commits(link_header: str) -> int | None:
    # With per_page=1, the last page number is the number of commits.
    links = {
        relation: url
        for url, relation in re.findall(r'<([^>]+)>;\s*rel="([^"]+)"', link_header)
    }
    if last := links.get("last"):
        page = parse_qs(urlsplit(last).query).get("page", [""])[0]
        if page.isascii() and page.isdecimal() and int(page) >= 2:
            return int(page)
        return None
    return None if "next" in links else 1


def fetch_repository(reference: str | int) -> RepositoryMetadata:
    path = (
        f"/repositories/{reference}"
        if isinstance(reference, int)
        else f"/repos/{reference.removeprefix(REPOSITORY_URL)}"
    )
    repo, _ = request_github(path)
    try:
        if repo["visibility"] != "public":
            raise GitHubError(404, "Public GitHub repository not found.")
        url = normalize_repository_url(repo["html_url"])
        name = url.removeprefix(REPOSITORY_URL)
        query = urlencode({"per_page": 1, "sha": repo["default_branch"]})
        commits, links = request_github(
            f"/repos/{name}/commits?{query}", allow_empty=True
        )
        head = commits[0] if commits else None
        commit = head["commit"] if head is not None else None
        return RepositoryMetadata(
            github_id=repo["id"],
            url=url,
            full_name=repo["full_name"],
            description=repo["description"],
            default_branch=repo["default_branch"],
            language=repo["language"],
            stars=repo["stargazers_count"],
            archived=repo["archived"],
            commit_count=count_commits(links) if head is not None else 0,
            last_commit_sha=head["sha"] if head is not None else None,
            last_commit_date=commit["committer"]["date"]
            if commit is not None
            else None,
            last_commit_subject=commit["message"].partition("\n")[0]
            if commit is not None
            else None,
        )
    except (AttributeError, IndexError, KeyError, TypeError, ValueError) as error:
        raise GitHubError(
            502, "GitHub returned incomplete repository metadata."
        ) from error
