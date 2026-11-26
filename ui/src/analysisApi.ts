import { request, requestJson } from './api'

export const severities = ['high', 'medium', 'low', 'informational'] as const
export type Severity = typeof severities[number]
type ResultStatus = 'queued' | 'running' | 'clean' | 'findings' | 'not_evaluated' | 'failed'

export type SeverityCounts = Record<Severity, number>

export type PythonCounts = {
  security_findings: number
  adverse_project_statuses: number
}

export type AnalysisSummary = {
  id: string
  repository_id: string
  repository_name: string
  global_run_id: string | null
  status: ResultStatus
  counts: SeverityCounts
  ci_cd_evaluated: boolean | null
  python_counts: PythonCounts | null
  branch: string | null
  commit: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

type Finding = {
  rule_id: string
  severity: Severity
  file: string
  line: number
  column: number
  message: string
  evidence: string
  remediation: string
}

export type DependencyAudit = {
  audited_packages: number
  vulnerabilities: {
    dependency: { name: string; version: string }
    id: string
    summary: string | null
    link: string
    fix_versions: string[]
  }[]
  adverse_statuses: { name: string; status: string; reason: string | null }[]
}

export type AnalysisResult = AnalysisSummary & {
  steps: {
    name: string
    status: 'passed' | 'findings' | 'skipped' | 'not_evaluated' | 'error'
    message: string
    findings: Finding[]
    dependency_audit: DependencyAudit | null
  }[]
}

export type GlobalRun = {
  id: string
  created_at: string
  repository_count: number
}

export type GlobalRunSummary = GlobalRun & {
  active_count: number
  evaluated_count: number
  counts: SeverityCounts | null
  python_counts: PythonCounts | null
}

type GlobalRunDetails = GlobalRun & {
  clean_count: number
  results: AnalysisSummary[]
}

const globalRunsUrl = '/api/global-runs'
const historyUrl = (id: string) => `/api/repositories/${id}/analysis-results`
export const globalRunsKey = ['global-runs']
export const analysisHistoryKey = ['analysis-history']

export const analysisApi = {
  start: (id: string) => requestJson<AnalysisSummary>(historyUrl(id), { method: 'POST' }),
  history: (id: string, signal: AbortSignal) =>
    requestJson<AnalysisSummary[]>(historyUrl(id), { signal }),
  result: (id: string, signal: AbortSignal) =>
    requestJson<AnalysisResult>(`/api/analysis-results/${id}`, { signal }),
  startGlobal: () => requestJson<GlobalRun>(globalRunsUrl, { method: 'POST' }),
  globalRuns: (signal: AbortSignal) => requestJson<GlobalRunSummary[]>(globalRunsUrl, { signal }),
  globalRun: (id: string, signal: AbortSignal) =>
    requestJson<GlobalRunDetails>(`${globalRunsUrl}/${id}`, { signal }),
  async deleteGlobal(id: string) {
    await request(`${globalRunsUrl}/${id}`, { method: 'DELETE' })
  },
}

export function isActive(result: AnalysisSummary) {
  return result.status === 'queued' || result.status === 'running'
}

export function resultCount(result: AnalysisSummary, severity: Severity) {
  const count = result.counts[severity]
  if (isActive(result) || (count === 0 && !isCiCdEvaluated(result))) {
    return undefined
  }
  return count
}

export function isCiCdEvaluated(result: AnalysisSummary) {
  return result.ci_cd_evaluated ?? (result.status === 'clean' || result.status === 'findings')
}

export function totalPythonFindings(counts: PythonCounts) {
  return counts.security_findings + counts.adverse_project_statuses
}
