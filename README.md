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

## Project status

This repository is at the planning stage. The backend and UI are planned, and the scanner is developed in Nomad SecOps.
