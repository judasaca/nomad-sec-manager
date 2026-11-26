import { request, requestJson } from './api'

export const severities = ['high', 'medium', 'low', 'informational'] as const
export type Severity = typeof severities[number]
export const severityBuckets = [...severities, 'unavailable'] as const
export type SeverityBucket = typeof severityBuckets[number]
type ResultStatus = 'queued' | 'running' | 'clean' | 'findings' | 'not_evaluated' | 'failed'

export type SeverityCounts = Record<SeverityBucket, number>

export type PythonCounts = {
  vulnerabilities: number
  project_status_findings: number
}

export type AnalysisSummary = {
  id: string
  repository_id: string
  repository_name: string
  global_run_id: string | null
  status: ResultStatus
  counts: SeverityCounts | null
  ci_cd_count: number | null
  python_counts: PythonCounts | null
  branch: string | null
  commit: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

type FindingBase = {
  message: string
  severity: Severity | null
  advisory_id: string | null
}

type DependencyProjectStatus = { name: string; status: string; reason: string | null }

export type Finding = FindingBase & (
  | {
    kind: 'ci-cd'
    severity: Severity
    metadata: {
      rule_id: string
      confidence: 'low' | 'medium' | 'high'
      persona: 'regular' | 'pedantic'
      file: string
      line: number
      column: number
      location: string
      evidence: string
      remediation: string
      upstream: {
        tool: string
        rule_id: string
        version: string | null
        commit: string | null
        source_url: string | null
        documentation_url: string
      }
    }
  }
  | {
    kind: 'dependency-vulnerability'
    metadata: {
      dependency: { name: string; version: string }
      link: string
      fix_versions: string[]
    }
  }
  | { kind: 'dependency-project-status'; metadata: DependencyProjectStatus }
)

export type DependencyAudit = {
  audited_packages: number
  adverse_statuses: DependencyProjectStatus[]
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
  ci_cd_count: number | null
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

export function totalFindings(counts: SeverityCounts) {
  return severityBuckets.reduce((total, severity) => total + counts[severity], 0)
}

export function totalPythonFindings(counts: PythonCounts) {
  return counts.vulnerabilities + counts.project_status_findings
}
