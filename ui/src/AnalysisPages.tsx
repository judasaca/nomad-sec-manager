import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Link,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLink, useNavigate, useParams } from '@tanstack/react-router'
import { useId, useState } from 'react'
import {
  analysisApi, analysisHistoryKey, globalRunsKey, isActive, isCiCdEvaluated, resultCount,
  severities, totalPythonFindings, type AnalysisResult, type AnalysisSummary, type DependencyAudit,
  type GlobalRunSummary, type PythonCounts, type Severity, type SeverityCounts,
} from './analysisApi'
import { ResultStatus, statusLabels } from './AnalysisResultStatus'
import { FindingsTrendPlot } from './FindingsTrendPlot'
import { repositoriesApi, repositoriesKey } from './repositoriesApi'
import { severityFill, severityLabels } from './severity'

const RoutedLink = createLink(Link)
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const severityColors: Record<Severity, string> = {
  high: 'error.main',
  medium: 'warning.main',
  low: '#826100',
  informational: 'info.main',
}

function severityTone(severity: Severity) {
  return (theme: Theme) => ({
    color: severityColors[severity],
    ...(severity === 'low' && theme.applyStyles('dark', { color: '#FFE082' })),
  })
}

function SeverityTag({ severity, count }: { severity: Severity; count?: number }) {
  const label = severityLabels[severity]
  return (
    <Chip
      size="small"
      variant="outlined"
      label={(
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, lineHeight: 1.25 }}>
          <Box
            component="span"
            aria-hidden
            sx={[severityFill(severity), { width: 10, height: 10, flexShrink: 0, borderRadius: '50%' }]}
          />
          {count === undefined ? label : `${label} ${count.toLocaleString()}`}
        </Box>
      )}
      sx={{ bgcolor: 'background.paper', color: 'text.primary' }}
    />
  )
}

function totalFindings(counts: SeverityCounts) {
  return severities.reduce((total, severity) => total + counts[severity], 0)
}

function SeverityOverview({ counts }: { counts: SeverityCounts }) {
  const total = totalFindings(counts)
  return (
    <Paper component="section" aria-label="CI/CD findings by severity" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h3" component="h2">CI/CD findings by severity</Typography>
          <Typography color="text.secondary">
            {total.toLocaleString()} {total === 1 ? 'finding' : 'findings'} total
          </Typography>
        </Stack>
        {total > 0 && (
          <Box aria-hidden sx={{ display: 'flex', gap: '2px', height: 14, borderRadius: 1, overflow: 'hidden' }}>
            {severities.filter((severity) => counts[severity] > 0).map((severity) => (
              <Box
                key={severity}
                sx={[severityFill(severity), { flex: counts[severity] }]}
              />
            ))}
          </Box>
        )}
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }}>
          {severities.map((severity) => (
            <SeverityTag key={severity} severity={severity} count={counts[severity]} />
          ))}
        </Stack>
      </Stack>
    </Paper>
  )
}

function RunDate({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>
}

function PythonAuditDetails({ audit }: { audit: DependencyAudit }) {
  return (
    <Stack spacing={1}>
      <Typography variant="h3" component="h3">Python dependencies</Typography>
      {audit.vulnerabilities.map(({ dependency, id, summary, link, fix_versions }) => (
        <Paper key={`${dependency.name}@${dependency.version}:${id}`} variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
          <Stack spacing={0.75}>
            <Typography sx={{ fontWeight: 700 }}>{dependency.name} {dependency.version}</Typography>
            <Typography>
              {link.startsWith('https://') ? <Link href={link} target="_blank" rel="noreferrer">{id}</Link> : id}
            </Typography>
            {summary && <Typography>{summary}</Typography>}
            {fix_versions.length > 0 && (
              <Typography variant="body2">Fixed in {fix_versions.join(', ')}</Typography>
            )}
          </Stack>
        </Paper>
      ))}
      {audit.adverse_statuses.map(({ name, status, reason }) => (
        <Paper key={`${name}:${status}`} variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
          <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
          <Typography>{status}</Typography>
          {reason && <Typography variant="body2">{reason}</Typography>}
        </Paper>
      ))}
    </Stack>
  )
}

function ResultDialog({ result, onClose }: { result: AnalysisSummary; onClose: () => void }) {
  const [showFindings, setShowFindings] = useState(false)
  const findingsId = useId()
  const incomplete = result.status === 'failed' || result.status === 'not_evaluated'
  const pythonCounts = result.python_counts
  const hasCiCdFindings = totalFindings(result.counts) > 0
  const hasFindings = hasCiCdFindings || (pythonCounts ? totalPythonFindings(pythonCounts) : 0) > 0
  const needsDiagnostic = incomplete && !result.error
  const report = useQuery({
    queryKey: ['analysis-result', result.id],
    queryFn: ({ signal }) => analysisApi.result(result.id, signal),
    enabled: showFindings || needsDiagnostic,
  })

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="analysis-result-title">
      <DialogTitle id="analysis-result-title">{result.repository_name}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <ResultStatus result={result} />
            <Typography color="text.secondary"><RunDate value={result.created_at} /></Typography>
            {result.branch && <Typography>{result.branch}</Typography>}
            {result.commit && <code>{result.commit}</code>}
          </Stack>
          {result.error && <Alert severity="error">{result.error}</Alert>}
          {isActive(result) && (
            <Typography color="text.secondary">The report will appear when the scan finishes.</Typography>
          )}
          {(isCiCdEvaluated(result) || hasCiCdFindings) && <SeverityOverview counts={result.counts} />}
          {pythonCounts && (
            <Paper component="section" variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h3" component="h2">Python dependencies</Typography>
              <Typography color="text.secondary">
                {pythonCounts.security_findings.toLocaleString()} security findings ·{' '}
                {pythonCounts.adverse_project_statuses.toLocaleString()} adverse project statuses
              </Typography>
            </Paper>
          )}
          {needsDiagnostic && report.data?.steps
            .filter((step) => step.status === 'error' || step.status === 'not_evaluated' || step.status === 'skipped')
            .map((step) => <Alert key={step.name} severity={step.status === 'error' ? 'error' : 'warning'}>{step.message}</Alert>)}
          {hasFindings && (
            <Button
              sx={{ alignSelf: 'flex-start' }}
              aria-controls={findingsId}
              aria-expanded={showFindings}
              onClick={() => setShowFindings((shown) => !shown)}
            >
              {showFindings ? 'Hide finding details' : 'Show finding details'}
            </Button>
          )}
          {(showFindings || needsDiagnostic) && report.isPending && (
            <CircularProgress size={24} aria-label="Loading report details" />
          )}
          {(showFindings || needsDiagnostic) && report.error && <Alert severity="error">{report.error.message}</Alert>}
          <Box id={findingsId} hidden={!showFindings}>
            {showFindings && (
              <Stack spacing={2}>
                {report.data?.steps.filter(({ dependency_audit }) =>
                  dependency_audit && (dependency_audit.vulnerabilities.length > 0 || dependency_audit.adverse_statuses.length > 0),
                ).map(({ name, dependency_audit }) => (
                  dependency_audit && <PythonAuditDetails key={name} audit={dependency_audit} />
                ))}
                {report.data?.steps.filter((step) => step.findings.length > 0).map((step) => (
                  <Stack key={step.name} spacing={1}>
                    <Typography variant="h3" component="h3">{step.name === 'ci-cd' ? 'CI/CD' : step.name}</Typography>
                    {step.findings.map((finding, index) => (
                      <Paper key={index} variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <SeverityTag severity={finding.severity} />
                            <Typography sx={{ fontWeight: 700 }}>{finding.rule_id}</Typography>
                          </Stack>
                          <Typography component="code" variant="body2">
                            {finding.file}:{finding.line}:{finding.column}
                          </Typography>
                          <Typography>{finding.message}</Typography>
                          {finding.evidence && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{finding.evidence}</Typography>}
                          {finding.remediation && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{finding.remediation}</Typography>}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}

type FindingGroup = 'python' | 'ci_cd'
type FindingColumn = FindingGroup | keyof PythonCounts | Severity
type FindingTableColumn = { key: FindingColumn; label: string; group?: FindingGroup }

const severityColumns = severities.map((key) => ({ key, label: severityLabels[key] }))
const findingGroups: { key: FindingGroup; label: string; details: FindingTableColumn[] }[] = [
  {
    key: 'python',
    label: 'Python',
    details: [
      { key: 'security_findings', label: 'Security findings' },
      { key: 'adverse_project_statuses', label: 'Adverse project statuses' },
    ],
  },
  { key: 'ci_cd', label: 'CI/CD', details: severityColumns },
]
const detailedColumns = findingGroups.flatMap(({ details }) => details)

function globalFindingColumns(showDetails: boolean): FindingTableColumn[] {
  return findingGroups.flatMap(({ key, label, details }) => [
    { key, label, group: key },
    ...(showDetails ? details.map((column) => ({ ...column, group: key })) : []),
  ])
}

function findingColumnStyle(group: FindingGroup | undefined, column: string) {
  if (!group) return undefined

  const isTotal = column === group
  return (theme: Theme) => {
    const color = theme.vars.palette[group === 'python' ? 'primary' : 'secondary'].main
    return {
      backgroundColor: theme.alpha(color, isTotal ? 0.18 : 0.09),
      fontVariantNumeric: 'tabular-nums',
      ...(isTotal && { borderInlineStart: `1px solid ${theme.alpha(color, 0.3)}`, fontWeight: 700 }),
      ...theme.applyStyles('dark', {
        backgroundColor: theme.alpha(color, isTotal ? 0.24 : 0.14),
      }),
    }
  }
}

function isSeverity(column: FindingColumn): column is Severity {
  return Object.hasOwn(severityLabels, column)
}

function findingCount({ counts, python_counts }: GlobalRunSummary | AnalysisSummary, column: FindingColumn) {
  if (column === 'python') return python_counts == null ? undefined : totalPythonFindings(python_counts)
  if (column === 'ci_cd') return counts == null ? undefined : totalFindings(counts)
  if (isSeverity(column)) return counts?.[column]
  return python_counts?.[column]
}

function globalResultCount(result: AnalysisSummary, column: FindingColumn) {
  if (isSeverity(column)) return resultCount(result, column)
  const count = findingCount(result, column)
  if (column === 'ci_cd' && (isActive(result) || (count === 0 && !isCiCdEvaluated(result)))) return undefined
  return count
}

type SortDirection = 'asc' | 'desc'

function compareCounts(a: number | undefined, b: number | undefined, direction: SortDirection) {
  if (a === undefined) return b === undefined ? 0 : 1
  if (b === undefined) return -1
  return direction === 'asc' ? a - b : b - a
}

function DetailedColumnsSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <FormControlLabel
      sx={{ alignSelf: 'flex-start', m: 0 }}
      control={<Switch checked={checked} onChange={(_, next) => onChange(next)} />}
      label="Show detailed columns"
    />
  )
}

type SortColumn = 'repository_name' | 'status' | FindingColumn
const initialResultSort = { column: 'repository_name', direction: 'asc' } as const

function ResultsTable({
  results,
  global = false,
  showDetails = false,
}: {
  results: AnalysisSummary[]
  global?: boolean
  showDetails?: boolean
}) {
  const [selectedResult, setSelectedResult] = useState<string | null>(null)
  const selection = results.find(({ id }) => id === selectedResult)
  const [selectedSort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>(initialResultSort)
  const columns: FindingTableColumn[] = global ? globalFindingColumns(showDetails) : severityColumns
  const sort = !showDetails && detailedColumns.some(({ key }) => key === selectedSort.column)
    ? initialResultSort
    : selectedSort
  const rows = global ? [...results].sort((a, b) => {
    const { column, direction } = sort
    const order = direction === 'asc' ? 1 : -1
    const comparison = column === 'repository_name'
      ? a.repository_name.localeCompare(b.repository_name) * order
      : column === 'status'
        ? statusLabels[a.status].localeCompare(statusLabels[b.status]) * order
        : compareCounts(globalResultCount(a, column), globalResultCount(b, column), direction)
    return comparison || a.repository_name.localeCompare(b.repository_name)
  }) : results

  function heading(label: string, column: SortColumn, numeric = false, group?: FindingGroup) {
    const active = sort.column === column
    return (
      <TableCell
        key={column}
        align={numeric ? 'right' : 'left'}
        sortDirection={global && active ? sort.direction : false}
        sx={findingColumnStyle(group, column)}
      >
        {global ? (
          <TableSortLabel
            active={active}
            direction={active ? sort.direction : numeric ? 'desc' : 'asc'}
            onClick={() => setSort({
              column,
              direction: active ? (sort.direction === 'asc' ? 'desc' : 'asc') : numeric ? 'desc' : 'asc',
            })}
          >
            {label}
          </TableSortLabel>
        ) : label}
      </TableCell>
    )
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label={global ? 'Global run results' : 'Repository analysis history'}>
          <TableHead>
            <TableRow>
              {global ? heading('Repository', 'repository_name') : <TableCell>Started</TableCell>}
              {heading('Status', 'status')}
              {columns.map(({ key, label, group }) => heading(label, key, true, group))}
              {!global && <TableCell>Run</TableCell>}
              <TableCell align="right">Report</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((result) => (
              <TableRow key={result.id}>
                <TableCell component="th" scope="row">
                  {global ? (
                    <RoutedLink to="/repositories/$repositoryId/analysis" params={{ repositoryId: result.repository_id }}>
                      {result.repository_name}
                    </RoutedLink>
                  ) : <RunDate value={result.created_at} />}
                  {!global && result.commit && (
                    <Typography component="div" variant="body2" color="text.secondary">
                      {result.branch} <code>{result.commit}</code>
                    </Typography>
                  )}
                </TableCell>
                <TableCell><ResultStatus result={result} /></TableCell>
                {columns.map(({ key, group }) => {
                  const severity = isSeverity(key) ? key : undefined
                  const count = global ? globalResultCount(result, key) : severity && resultCount(result, severity)
                  const emphasizedSeverity = !global && severity && count !== undefined && count > 0
                  return (
                    <TableCell
                      key={key}
                      align="right"
                      sx={emphasizedSeverity ? [severityTone(severity), { fontWeight: 700 }] : findingColumnStyle(group, key)}
                    >
                      {count === undefined ? <span aria-label="Count unavailable">—</span> : global && severity && count > 0 ? (
                        <Box
                          component="span"
                          sx={[severityFill(severity), {
                            display: 'inline-block',
                            minWidth: 32,
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            textAlign: 'center',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                          }]}
                        >
                          {count.toLocaleString()}
                        </Box>
                      ) : count.toLocaleString()}
                    </TableCell>
                  )
                })}
                {!global && (
                  <TableCell>
                    {result.global_run_id ? (
                      <RoutedLink to="/global-runs/$runId" params={{ runId: result.global_run_id }}>
                        Global
                      </RoutedLink>
                    ) : 'Single'}
                  </TableCell>
                )}
                <TableCell align="right">
                  <Button size="small" onClick={() => setSelectedResult(result.id)}>View report</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {selection && <ResultDialog key={selection.id} result={selection} onClose={() => setSelectedResult(null)} />}
    </>
  )
}

function FindingsTrend({ runs }: { runs: GlobalRunSummary[] }) {
  const [selectedId, setSelectedId] = useState<string>()
  const points = runs.flatMap((run) => run.counts ? [{ ...run, counts: run.counts }] : []).reverse()
  const selected = points.find((run) => run.id === selectedId) ?? points.at(-1)

  return (
    <Paper component="section" aria-label="CI/CD findings over time" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="h3" component="h2">CI/CD findings over time</Typography>
        {selected ? (
          <>
            <FindingsTrendPlot
              points={points}
              selectedIndex={points.indexOf(selected)}
              onSelect={(index) => setSelectedId(points[index].id)}
            />
            <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                <RunDate value={selected.created_at} />
              </Typography>
              {severities.map((severity) => (
                <SeverityTag key={severity} severity={severity} count={selected.counts[severity]} />
              ))}
              {selected.evaluated_count < selected.repository_count && (
                <Typography variant="body2" color="text.secondary">
                  {selected.evaluated_count} of {selected.repository_count} repositories fully evaluated
                </Typography>
              )}
            </Stack>
            {points.some((run) => run.evaluated_count < run.repository_count) && (
              <Typography variant="body2" color="text.secondary">
                Totals from partially evaluated runs may reflect fewer repositories.
              </Typography>
            )}
          </>
        ) : (
          <Typography color="text.secondary">CI/CD counts will appear when a global run has finished with usable results.</Typography>
        )}
      </Stack>
    </Paper>
  )
}

type GlobalRunSortColumn = 'created_at' | 'repository_count' | FindingColumn
const initialGlobalRunSort = { column: 'created_at', direction: 'desc' } as const

function runSortValue(run: GlobalRunSummary, column: GlobalRunSortColumn) {
  if (column === 'created_at') return Date.parse(run.created_at)
  if (column === 'repository_count') return run.repository_count
  return findingCount(run, column)
}

export function GlobalRunsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showDetails, setShowDetails] = useState(false)
  const [selectedSort, setSort] = useState<{ column: GlobalRunSortColumn; direction: SortDirection }>(initialGlobalRunSort)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [deleteError, setDeleteError] = useState<string>()
  const runs = useQuery({
    queryKey: globalRunsKey,
    queryFn: ({ signal }) => analysisApi.globalRuns(signal),
    refetchInterval: (query) => query.state.data?.some((run) => run.active_count > 0) ? 1500 : false,
  })
  const start = useMutation({
    mutationFn: analysisApi.startGlobal,
    onSuccess: async (run) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: globalRunsKey }),
        queryClient.invalidateQueries({ queryKey: repositoriesKey, exact: true }),
      ])
      await navigate({ to: '/global-runs/$runId', params: { runId: run.id } })
    },
  })
  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const deleted = new Set<string>()
      const failed: string[] = []
      let errorMessage = ''
      for (const id of ids) {
        try {
          await analysisApi.deleteGlobal(id)
          deleted.add(id)
        } catch (error) {
          failed.push(id)
          errorMessage = error instanceof Error ? error.message : 'The backend could not complete the request.'
        }
      }
      return { deleted, failed, errorMessage }
    },
    onSuccess: async ({ deleted, failed, errorMessage }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: globalRunsKey, exact: true }),
        queryClient.cancelQueries({ queryKey: analysisHistoryKey }),
      ])
      queryClient.setQueryData<GlobalRunSummary[]>(globalRunsKey, (data) =>
        data?.filter((run) => !deleted.has(run.id)),
      )
      queryClient.setQueriesData<AnalysisSummary[]>({ queryKey: analysisHistoryKey }, (history) =>
        history?.filter((result) => !result.global_run_id || !deleted.has(result.global_run_id)),
      )
      for (const id of deleted) {
        queryClient.removeQueries({ queryKey: [...globalRunsKey, id], exact: true })
      }
      for (const [queryKey, result] of queryClient.getQueriesData<AnalysisResult>({ queryKey: ['analysis-result'] })) {
        if (result?.global_run_id && deleted.has(result.global_run_id)) {
          queryClient.removeQueries({ queryKey, exact: true })
        }
      }
      setSelectedIds(failed)
      setDeleteIds([])
      setDeleteError(failed.length
        ? `Could not delete ${failed.length} of ${deleted.size + failed.length} selected runs. ${errorMessage}`
        : undefined)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: globalRunsKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: analysisHistoryKey }),
        queryClient.invalidateQueries({ queryKey: repositoriesKey, exact: true }),
      ])
    },
  })
  const columns = globalFindingColumns(showDetails)
  const sort = !showDetails && detailedColumns.some(({ key }) => key === selectedSort.column)
    ? initialGlobalRunSort
    : selectedSort
  const rows = [...(runs.data ?? [])].sort((a, b) =>
    compareCounts(runSortValue(a, sort.column), runSortValue(b, sort.column), sort.direction)
    || Date.parse(b.created_at) - Date.parse(a.created_at),
  )
  const selection = new Set(selectedIds)
  const selectedRuns = rows.filter((run) => selection.has(run.id))
  const allSelected = rows.length > 0 && selectedRuns.length === rows.length

  function heading(label: string, column: GlobalRunSortColumn, group?: FindingGroup) {
    const active = sort.column === column
    return (
      <TableCell
        key={column}
        align={column === 'created_at' ? 'left' : 'right'}
        sortDirection={active ? sort.direction : false}
        sx={findingColumnStyle(group, column)}
      >
        <TableSortLabel
          active={active}
          direction={active ? sort.direction : 'desc'}
          onClick={() => setSort({
            column,
            direction: active && sort.direction === 'desc' ? 'asc' : 'desc',
          })}
        >
          {label}
        </TableSortLabel>
      </TableCell>
    )
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h1">Global runs</Typography>
        <Button variant="contained" onClick={() => start.mutate()} loading={start.isPending}>
          Run all repositories
        </Button>
      </Stack>
      {start.error && <Alert severity="error">{start.error.message}</Alert>}
      {deleteError && <Alert severity="error" onClose={() => setDeleteError(undefined)}>{deleteError}</Alert>}
      {runs.isPending && <CircularProgress size={28} aria-label="Loading global runs" />}
      {runs.error && <Alert severity="error">{runs.error.message}</Alert>}
      {runs.data?.length === 0 && <Typography color="text.secondary">No global runs yet.</Typography>}
      {runs.data && <FindingsTrend runs={runs.data} />}
      {rows.length > 0 && (
        <Stack spacing={1}>
          <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography color="text.secondary" role="status">
              {rows.length.toLocaleString()} {rows.length === 1 ? 'run' : 'runs'}
              {selectedRuns.length > 0 && ` · ${selectedRuns.length.toLocaleString()} selected`}
            </Typography>
            <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <DetailedColumnsSwitch checked={showDetails} onChange={setShowDetails} />
              <Button
                variant="outlined"
                color="error"
                disabled={selectedRuns.length === 0 || remove.isPending}
                onClick={() => {
                  setDeleteError(undefined)
                  setDeleteIds(selectedRuns.map(({ id }) => id))
                }}
              >
                Delete selected
              </Button>
            </Stack>
          </Stack>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Global runs">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={!allSelected && selectedRuns.length > 0}
                      disabled={remove.isPending}
                      slotProps={{ input: {
                        'aria-label': 'Select all global runs',
                        'aria-checked': !allSelected && selectedRuns.length > 0 ? 'mixed' : allSelected,
                      } }}
                      onChange={(_, checked) => setSelectedIds(checked ? rows.map(({ id }) => id) : [])}
                    />
                  </TableCell>
                  {heading('Started', 'created_at')}
                  {heading('Repositories at launch', 'repository_count')}
                  {columns.map(({ key, label, group }) => heading(label, key, group))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((run) => (
                  <TableRow key={run.id} selected={selection.has(run.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selection.has(run.id)}
                        disabled={remove.isPending}
                        slotProps={{ input: { 'aria-label': `Select run started ${dateFormat.format(new Date(run.created_at))}` } }}
                        onChange={(_, checked) => setSelectedIds((ids) =>
                          checked ? [...ids, run.id] : ids.filter((id) => id !== run.id),
                        )}
                      />
                    </TableCell>
                    <TableCell component="th" scope="row">
                      <RoutedLink to="/global-runs/$runId" params={{ runId: run.id }}>
                        <RunDate value={run.created_at} />
                      </RoutedLink>
                    </TableCell>
                    <TableCell align="right">{run.repository_count.toLocaleString()}</TableCell>
                    {columns.map(({ key, group }) => (
                      <TableCell key={key} align="right" sx={findingColumnStyle(group, key)}>
                        {findingCount(run, key)?.toLocaleString() ?? <span aria-label="Count unavailable">—</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
      {deleteIds.length > 0 && (
        <Dialog
          open
          fullWidth
          maxWidth="sm"
          onClose={remove.isPending ? undefined : () => setDeleteIds([])}
          aria-labelledby="delete-selected-runs-title"
          aria-describedby="delete-selected-runs-description"
        >
          <DialogTitle id="delete-selected-runs-title">
            Delete {deleteIds.length.toLocaleString()} {deleteIds.length === 1 ? 'global run' : 'global runs'}?
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="delete-selected-runs-description">
              This permanently deletes the selected runs and their reports from repository histories.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button autoFocus disabled={remove.isPending} onClick={() => setDeleteIds([])}>Cancel</Button>
            <Button variant="contained" color="error" loading={remove.isPending} onClick={() => remove.mutate(deleteIds)}>
              Delete selected
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  )
}

export function GlobalRunPage() {
  const { runId } = useParams({ from: '/global-runs/$runId' })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const runKey = [...globalRunsKey, runId]
  const run = useQuery({
    queryKey: runKey,
    queryFn: ({ signal }) => analysisApi.globalRun(runId, signal),
    refetchInterval: (query) => query.state.data?.results.some(isActive) ? 1500 : false,
  })
  const data = run.data
  const remaining = data?.results.length ?? 0
  const removed = data ? data.repository_count - remaining : 0
  const remove = useMutation({
    mutationFn: () => analysisApi.deleteGlobal(runId),
    onSuccess: async () => {
      queryClient.setQueryData<GlobalRunSummary[]>(globalRunsKey, (runs) => runs?.filter(({ id }) => id !== runId))
      queryClient.setQueriesData<AnalysisSummary[]>({ queryKey: analysisHistoryKey }, (history) =>
        history?.filter((result) => result.global_run_id !== runId),
      )
      for (const result of data?.results ?? []) {
        queryClient.removeQueries({ queryKey: ['analysis-result', result.id], exact: true })
      }
      setConfirmDelete(false)
      await navigate({ to: '/global-runs', replace: true })
      queryClient.removeQueries({ queryKey: runKey, exact: true })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: globalRunsKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: analysisHistoryKey }),
        queryClient.invalidateQueries({ queryKey: repositoriesKey, exact: true }),
      ])
    },
  })
  const counts = { high: 0, medium: 0, low: 0, informational: 0 }
  let repositoriesWithFindings = 0
  for (const result of data?.results ?? []) {
    for (const severity of severities) counts[severity] += result.counts[severity]
    if (totalFindings(result.counts) > 0 || (result.python_counts && totalPythonFindings(result.python_counts) > 0)) {
      repositoriesWithFindings += 1
    }
  }
  const hasCiCdResults = totalFindings(counts) > 0 || data?.results.some(isCiCdEvaluated)

  return (
    <Stack spacing={3}>
      <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <RoutedLink to="/global-runs">Global runs</RoutedLink>
          <Typography variant="h1" sx={{ mt: 0.5 }}>Global run</Typography>
          {data && <Typography color="text.secondary"><RunDate value={data.created_at} /></Typography>}
        </Box>
        {data && !run.error && (
          <Button variant="outlined" color="error" onClick={() => {
            remove.reset()
            setConfirmDelete(true)
          }}>
            Delete global run
          </Button>
        )}
      </Stack>
      {run.isPending && <CircularProgress size={28} aria-label="Loading global run" />}
      {run.error && <Alert severity="error">{run.error.message}</Alert>}
      {data && (
        <>
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }} role="status">
            {remaining > 0 && <Chip label={`${data.results.filter((result) => !isActive(result)).length} of ${remaining} finished`} />}
            <Chip color="success" label={`${data.clean_count} clean`} />
            <Chip color="warning" label={`${repositoriesWithFindings} with findings`} />
            <Chip label={`${data.results.filter((result) => result.status === 'failed' || result.status === 'not_evaluated').length} incomplete`} />
            {removed > 0 && <Chip label={`${removed} ${removed === 1 ? 'report' : 'reports'} removed`} />}
          </Stack>
          {remaining > 0 ? (
            <>
              <DetailedColumnsSwitch checked={showDetails} onChange={setShowDetails} />
              {showDetails && hasCiCdResults && <SeverityOverview counts={counts} />}
              <ResultsTable key={data.id} results={data.results} global showDetails={showDetails} />
            </>
          ) : (
            <Typography color="text.secondary">No reports remain for this run.</Typography>
          )}
        </>
      )}
      {confirmDelete && (
        <Dialog
          open
          fullWidth
          maxWidth="sm"
          onClose={remove.isPending ? undefined : () => setConfirmDelete(false)}
          aria-labelledby="delete-global-run-title"
          aria-describedby="delete-global-run-description"
        >
          <DialogTitle id="delete-global-run-title">Delete global run?</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              {remove.error && <Alert severity="error">{remove.error.message}</Alert>}
              <DialogContentText id="delete-global-run-description">
                This permanently deletes the run and all of its reports from repository histories.
              </DialogContentText>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button autoFocus disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="contained" color="error" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete global run
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  )
}

export function RepositoryAnalysisPage() {
  const { repositoryId } = useParams({ from: '/repositories/$repositoryId/analysis' })
  const queryClient = useQueryClient()
  const historyKey = [...analysisHistoryKey, repositoryId]
  const repository = useQuery({
    queryKey: [...repositoriesKey, repositoryId],
    queryFn: ({ signal }) => repositoriesApi.get(repositoryId, signal),
    retry: false,
  })
  const history = useQuery({
    queryKey: historyKey,
    queryFn: ({ signal }) => analysisApi.history(repositoryId, signal),
    refetchInterval: (query) => query.state.data?.some(isActive) ? 1500 : false,
    retry: false,
  })
  const start = useMutation({
    mutationFn: () => analysisApi.start(repositoryId),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: historyKey }),
      queryClient.invalidateQueries({ queryKey: repositoriesKey, exact: true }),
    ]),
  })
  const name = repository.data?.full_name ?? history.data?.[0]?.repository_name

  return (
    <Stack spacing={3}>
      <RoutedLink to="/repositories" sx={{ alignSelf: 'flex-start' }}>Repositories</RoutedLink>
      <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography variant="h1">{name ?? 'Repository'}</Typography>
          <Typography color="text.secondary">Static analysis history</Typography>
        </Box>
        {repository.data && (
          <Button variant="contained" onClick={() => start.mutate()} loading={start.isPending}>Run static analysis</Button>
        )}
      </Stack>
      {start.error && <Alert severity="error">{start.error.message}</Alert>}
      {history.isPending && <CircularProgress size={28} aria-label="Loading analysis history" />}
      {history.error && <Alert severity="error">{history.error.message}</Alert>}
      {repository.error && history.data && <Alert severity="info">{repository.error.message}</Alert>}
      {history.data?.length === 0 && <Typography color="text.secondary">No analysis results yet.</Typography>}
      {!!history.data?.length && <ResultsTable key={repositoryId} results={history.data} />}
    </Stack>
  )
}
