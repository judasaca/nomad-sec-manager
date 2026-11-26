# NOMAD Security Manager

NOMAD Security Manager is a planned security management platform for the NOMAD ecosystem. This repository will house the backend service and web UI that maintainers use to run security checks across repositories and review the results in one place.

## First milestone: Static analysis

The first milestone is a backend service that runs repeatable static analysis checks against a configured set of GitHub and GitLab repositories. The service will coordinate scan runs and collect their results for review in the UI.

The backend depends on Nomad SecOps, a standalone Python project that supports both GitHub and GitLab. Its `develop` branch audits GitHub Actions workflows with zizmor, checks for unpinned container images in GitLab CI configurations, and audits Python dependencies recorded in a root `uv.lock` file. See the [Nomad SecOps `develop` branch](https://github.com/judasaca/nomad-sec-ops/tree/develop) for the available checks and scanner usage.

## Technology stack

- **Backend** — Python with FastAPI for the HTTP API and Pydantic for request, response, and configuration validation.
- **Database** — MongoDB with PyMongo Async for repository configuration, scan runs, and findings with nested scanner evidence.
- **Frontend** — React and TypeScript with Vite for development and builds, TanStack Router for routing, and TanStack Query for API data and scan status polling.
- **UI theme** — Material UI 9 with Emotion. The manager will build its own UI components and adapt the light and dark palettes, typography, and component styling from the [NOMAD GUI theme](https://gitlab.mpcdf.mpg.de/nomad-lab/nomad-gui/-/blob/develop/src/components/theme/themeOptions.ts).

## Roadmap

- **Static analysis** — Run security checks consistently across a configured set of repositories.
- **Repository mapping** — Build an inventory of repositories in the NOMAD ecosystem.
- **Deployment monitoring** — Track deployments across the ecosystem.
- **Findings and incident management** — Triage findings and track security incidents through resolution.
- **Security alerts** — Notify maintainers about security events that need attention.

## Local development

Install Git, uv, Node.js 24 with npm, and Docker with the Compose plugin. uv can install Python 3.14 from the backend's version pin. Python dependency audits use `uv` on the backend's PATH. CI uses uv 0.13.1. [uv installation guide](https://docs.astral.sh/uv/getting-started/installation/)

| Directory | Service | Default address | Port override |
| --- | --- | --- | --- |
| `backend/` | FastAPI | `http://127.0.0.1:18542/docs` | `NOMAD_API_PORT` |
| `ui/` | Vite dev server | `http://127.0.0.1:18543` | `NOMAD_UI_PORT` |
| `ui/` | Vite build preview | `http://127.0.0.1:18544` | `NOMAD_PREVIEW_PORT` |
| `infra/` | MongoDB | `mongodb://127.0.0.1:28547` | `NOMAD_MONGO_PORT` |

Start MongoDB from the repository root.

```sh
docker compose -f infra/compose.yaml up -d --wait
```

Run the backend and UI in separate terminals.

```sh
cd backend
uv run --upgrade-package nomad-sec-ops nomad-sec-manager-dev
```

```sh
cd ui
npm ci
npm run dev
```

The backend command checks GitHub for the latest Nomad SecOps `develop` commit at startup and records the resolved commit in `backend/uv.lock`. CI uses the committed lockfile.

Set the corresponding environment variable before launching a service to change its port. Set `NOMAD_API_PORT` for both the API and Vite when changing the API port because Vite proxies `/api` to the backend. Set `NOMAD_MONGO_PORT` for both Compose and the API when changing the MongoDB port. The API also accepts `NOMAD_MONGO_URI` and `NOMAD_MONGO_DATABASE` to override the connection string and database name. The default database is `nomad_sec_manager`. All services bind to the loopback interface. The MongoDB container uses a named volume and runs without authentication for local development.

Open **Repositories** in the UI and paste a public GitHub URL or `owner/repository` into **Add repository**. The API saves the GitHub metadata in MongoDB, including the default branch, description, language, stars, and the branch's commit count, latest commit hash, and committer date. Use **Refresh** to fetch a new snapshot, **Edit** to change the repository URL, or **Delete** to remove the saved entry. Imports and refreshes use GitHub's unauthenticated public API and are subject to its rate limits.

Open **Static analysis** on a saved repository to run a scan and review its history. Use **Global runs** → **Run all repositories** to scan the repositories saved at the time of launch. The global runs list and each run's repository table show **Python** and **CI/CD** totals. Turn on **Show detailed columns** to see Python security findings and adverse project statuses separately, plus CI/CD counts by severity. A dash indicates an unavailable count, including Python counts in reports created before Python auditing was added. Click a column heading to sort and **View report** to read the findings. Use **Delete global run** on a run's page to remove it and all of its linked reports from repository histories.

The backend runs scans in a single background worker against each repository's remote default branch and records the scanned revision when available. MongoDB stores the reports in `analysis_results` and the groups in `global_runs`. A report can link to a global run and always appears in the repository's history. Deleting a saved repository deletes all of its reports, including its rows in past global runs. Queued scans resume after a backend restart. A scan interrupted while running is marked failed.

Stop the application servers with Ctrl+C and run `docker compose -f infra/compose.yaml down` from the repository root to stop MongoDB and retain its data.

## Limitations

- **Concurrent use.** The current setup assumes one user and one scan worker. Before supporting shared use or multiple workers, review overlapping repository edits and deletions, job claiming, and recovery from interrupted runs.

## Checks

GitHub Actions runs on pull requests and pushes to `develop` and `main`. It verifies locked installs, runs the backend tests and Ruff checks, checks that the API can list repositories from MongoDB, and runs ESLint, TypeScript, and the UI build.
