# NOMAD Security Manager

NOMAD Security Manager is a planned security management platform for the NOMAD ecosystem. This repository will house the backend service and web UI that maintainers use to run security checks across repositories and review the results in one place.

## First milestone: Static analysis

The first milestone is a backend service that runs repeatable static analysis checks against a configured set of GitHub and GitLab repositories. The service will coordinate scan runs and collect their results for review in the UI.

The backend will use Nomad SecOps, a standalone Python project that supports both GitHub and GitLab. Its `develop` branch currently audits GitHub Actions workflows with zizmor and checks for unpinned container images declared in GitLab CI configurations. See the [Nomad SecOps `develop` branch](https://github.com/judasaca/nomad-sec-ops/tree/develop) for the available checks and scanner usage.

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

The repository contains a FastAPI scaffold, a minimal React entry point, and local MongoDB infrastructure. Install uv, Node.js 24 with npm, and Docker with the Compose plugin. uv can install Python 3.14 from the backend's version pin. [uv installation guide](https://docs.astral.sh/uv/getting-started/installation/)

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
uv sync --locked
uv run --locked nomad-sec-manager-dev
```

```sh
cd ui
npm ci
npm run dev
```

Set the corresponding environment variable before launching a service to change its port, for example `NOMAD_UI_PORT=19543 npm run dev`. All services bind to the loopback interface. The MongoDB container uses a named volume and runs without authentication for local development.

Stop the application servers with Ctrl+C and run `docker compose -f infra/compose.yaml down` from the repository root to stop MongoDB and retain its data.

## Checks

GitHub Actions runs on pull requests and pushes to `develop` and `main`. It verifies locked installs, runs Ruff lint and format checks, starts the API, runs ESLint and TypeScript checks, builds the UI, and starts MongoDB through Compose.
