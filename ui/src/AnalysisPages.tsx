import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Paper,
  Stack,
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
import { analysisApi, analysisHistoryKey, globalRunsKey, isActive, severities, type AnalysisSummary, type GlobalRun, type Severity } from './analysisApi'
import { repositoriesApi } from './repositoriesApi'

const RoutedLink = createLink(Link)
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const severityLabels: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
}

const severityColors: Record<Severity, string> = {
  high: 'error.main',
  medium: 'warning.main',
  low: '#826100',
  informational: 'info.main',
}

const severityFills = {
  high: { light: '#C81E35', lightText: '#FFF', dark: '#F04454' },
  medium: { light: '#D35410', lightText: '#111', dark: '#FB923C' },
  low: { light: '#B47A00', lightText: '#111', dark: '#FACC15' },
  informational: { light: '#0575B5', lightText: '#FFF', dark: '#38BDF8' },
} satisfies Record<Severity, { light: string; lightText: string; dark: string }>

function severityFill(severity: Severity) {
  const fill = severityFills[severity]
  return (theme: Theme) => ({
    backgroundColor: fill.light,
    color: fill.lightText,
    ...theme.applyStyles('dark', { backgroundColor: fill.dark, color: '#111' }),
  })
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

function totalFindings(counts: AnalysisSummary['counts']) {
  return severities.reduce((total, severity) => total + counts[severity], 0)
}

function SeverityOverview({ counts }: { counts: AnalysisSummary['counts'] }) {
  const total = totalFindings(counts)
  return (
    <Paper component="section" aria-label="Findings by severity" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h3" component="h2">Findings by severity</Typography>
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

const statusLabels: Record<AnalysisSummary['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  clean: 'Clean',
  findings: 'Findings',
  not_evaluated: 'Not evaluated',
  failed: 'Failed',
}

function RunDate({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>
}

function ResultStatus({ result }: { result: AnalysisSummary }) {
  const color = {
    clean: 'success',
    findings: 'warning',
    failed: 'error',
    running: 'info',
    queued: 'default',
    not_evaluated: 'default',
  } as const

  return <Chip size="small" label={statusLabels[result.status]} color={color[result.status]} />
}

function ResultDialog({ result, onClose }: { result: AnalysisSummary; onClose: () => void }) {
  const [showFindings, setShowFindings] = useState(false)
  const findingsId = useId()
  const incomplete = result.status === 'failed' || result.status === 'not_evaluated'
  const hasFindings = totalFindings(result.counts) > 0
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
          {(result.status === 'clean' || hasFindings) && <SeverityOverview counts={result.counts} />}
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

type SortColumn = 'repository_name' | 'status' | Severity

function ResultsTable({ results, global = false }: { results: AnalysisSummary[]; global?: boolean }) {
  const [selectedResult, setSelectedResult] = useState<string | null>(null)
  const selection = results.find(({ id }) => id === selectedResult)
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'repository_name',
    direction: 'asc',
  })
  const rows = global ? [...results].sort((a, b) => {
    const { column, direction } = sort
    const comparison = column === 'repository_name'
      ? a.repository_name.localeCompare(b.repository_name)
      : column === 'status'
        ? statusLabels[a.status].localeCompare(statusLabels[b.status])
        : a.counts[column] - b.counts[column]
    return (direction === 'asc' ? comparison : -comparison)
      || a.repository_name.localeCompare(b.repository_name)
  }) : results

  function heading(label: string, column: SortColumn, numeric = false) {
    const active = sort.column === column
    return (
      <TableCell
        key={column}
        align={numeric ? 'right' : 'left'}
        sortDirection={global && active ? sort.direction : false}
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
              {severities.map((severity) => heading(severityLabels[severity], severity, true))}
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
                {severities.map((severity) => {
                  const count = result.counts[severity]
                  const unavailable = isActive(result)
                    || ((result.status === 'failed' || result.status === 'not_evaluated') && count === 0)
                  return (
                    <TableCell
                      key={severity}
                      align="right"
                      sx={!global && count > 0 ? [severityTone(severity), { fontWeight: 700 }] : undefined}
                    >
                      {unavailable ? '—' : global && count > 0 ? (
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
                      ) : count}
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

export function GlobalRunsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const runs = useQuery({
    queryKey: globalRunsKey,
    queryFn: ({ signal }) => analysisApi.globalRuns(signal),
  })
  const start = useMutation({
    mutationFn: analysisApi.startGlobal,
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: globalRunsKey })
      await navigate({ to: '/global-runs/$runId', params: { runId: run.id } })
    },
  })

  return (
    <Stack spacing={3}>
      <Stack direction="row" useFlexGap sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h1">Global runs</Typography>
        <Button variant="contained" onClick={() => start.mutate()} loading={start.isPending}>
          Run all repositories
        </Button>
      </Stack>
      {start.error && <Alert severity="error">{start.error.message}</Alert>}
      {runs.isPending && <CircularProgress size={28} aria-label="Loading global runs" />}
      {runs.error && <Alert severity="error">{runs.error.message}</Alert>}
      {runs.data?.length === 0 && <Typography color="text.secondary">No global runs yet.</Typography>}
      {!!runs.data?.length && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Global runs">
            <TableHead>
              <TableRow><TableCell>Started</TableCell><TableCell align="right">Repositories at launch</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {runs.data.map((run) => (
                <TableRow key={run.id}>
                  <TableCell component="th" scope="row">
                    <RoutedLink to="/global-runs/$runId" params={{ runId: run.id }}>
                      <RunDate value={run.created_at} />
                    </RoutedLink>
                  </TableCell>
                  <TableCell align="right">{run.repository_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  )
}

export function GlobalRunPage() {
  const { runId } = useParams({ from: '/global-runs/$runId' })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      queryClient.setQueryData<GlobalRun[]>(globalRunsKey, (runs) => runs?.filter(({ id }) => id !== runId))
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
      ])
    },
  })
  const counts = { high: 0, medium: 0, low: 0, informational: 0 }
  for (const result of data?.results ?? []) {
    for (const severity of severities) counts[severity] += result.counts[severity]
  }

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
            <Chip color="warning" label={`${data.results.filter((result) => severities.some((severity) => result.counts[severity] > 0)).length} with findings`} />
            <Chip label={`${data.results.filter((result) => result.status === 'failed' || result.status === 'not_evaluated').length} incomplete`} />
            {removed > 0 && <Chip label={`${removed} ${removed === 1 ? 'report' : 'reports'} removed`} />}
          </Stack>
          {remaining > 0 ? (
            <>
              <SeverityOverview counts={counts} />
              <ResultsTable key={data.id} results={data.results} global />
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
    queryKey: ['repositories', repositoryId],
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKey }),
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
