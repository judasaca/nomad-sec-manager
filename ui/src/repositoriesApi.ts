import { request, requestJson } from './api'
import type { AnalysisSummary } from './analysisApi'

export type Repository = {
  id: string
  github_id: number
  url: string
  full_name: string
  description: string | null
  default_branch: string
  language: string | null
  stars: number
  archived: boolean
  commit_count: number | null
  last_commit_sha: string | null
  last_commit_date: string | null
  last_commit_subject: string | null
  created_at: string
  metadata_updated_at: string
}

export type RepositoryWithAnalysis = Repository & {
  latest_analysis: AnalysisSummary | null
}

export const repositoriesKey = ['repositories']
const repositoriesUrl = '/api/repositories'

function saveRepository(method: 'POST' | 'PATCH', path: string, url?: string) {
  return requestJson<Repository>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export const repositoriesApi = {
  list: (signal: AbortSignal) =>
    requestJson<RepositoryWithAnalysis[]>(repositoriesUrl, { signal }),
  get: (id: string, signal: AbortSignal) =>
    requestJson<Repository>(`${repositoriesUrl}/${id}`, { signal }),
  create: (url: string) => saveRepository('POST', repositoriesUrl, url),
  update: (id: string, url?: string) =>
    saveRepository('PATCH', `${repositoriesUrl}/${id}`, url),
  async remove(id: string) {
    await request(`${repositoriesUrl}/${id}`, { method: 'DELETE' })
  },
}
