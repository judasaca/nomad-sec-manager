import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLink, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { analysisApi, isActive, severities, type AnalysisSummary, type Severity } from './analysisApi'
import { repositoriesApi } from './repositoriesApi'

const globalRunsKey = ['global-runs']
const RoutedLink = createLink(Link)
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const severityLabels: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
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

function ResultDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const result = useQuery({
    queryKey: ['analysis-result', id],
    queryFn: ({ signal }) => analysisApi.result(id, signal),
    refetchInterval: (query) => query.state.data && isActive(query.state.data) ? 1500 : false,
  })
  const data = result.data

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="analysis-result-title">
      <DialogTitle id="analysis-result-title">{data?.repository_name ?? 'Analysis result'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {result.isPending && <CircularProgress size={24} aria-label="Loading analysis result" />}
          {result.error && <Alert severity="error">{result.error.message}</Alert>}
          {data && (
            <>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <ResultStatus result={data} />
                <Typography color="text.secondary"><RunDate value={data.created_at} /></Typography>
                {data.branch && <Typography>{data.branch}</Typography>}
                {data.commit && <code>{data.commit}</code>}
              </Stack>
              {data.error && <Alert severity="error">{data.error}</Alert>}
              {isActive(data) && (
                <Typography color="text.secondary">The report will appear when the scan finishes.</Typography>
              )}
              {data.steps.map((step) => (
                <Stack key={step.name} spacing={1}>
                  <Typography variant="h3" component="h3">{step.name === 'ci-cd' ? 'CI/CD' : step.name}</Typography>
                  <Typography>{step.message}</Typography>
                  {step.findings.map((finding, index) => (
                    <Paper key={index} variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
                      <Stack spacing={0.75}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Chip size="small" label={severityLabels[finding.severity]} />
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
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}

type SortColumn = 'repository_name' | 'status' | Severity

function ResultsTable({ results, global = false }: { results: AnalysisSummary[]; global?: boolean }) {
  const [selectedResult, setSelectedResult] = useState<string | null>(null)
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
                {severities.map((severity) => (
                  <TableCell key={severity} align="right">
                    {isActive(result) || ((result.status === 'failed' || result.status === 'not_evaluated') && !result.counts[severity])
                      ? '—'
                      : result.counts[severity]}
                  </TableCell>
                ))}
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
      {selectedResult && <ResultDialog id={selectedResult} onClose={() => setSelectedResult(null)} />}
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
              <TableRow><TableCell>Started</TableCell><TableCell align="right">Repositories</TableCell></TableRow>
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
  const run = useQuery({
    queryKey: [...globalRunsKey, runId],
    queryFn: ({ signal }) => analysisApi.globalRun(runId, signal),
    refetchInterval: (query) => query.state.data?.results.some(isActive) ? 1500 : false,
  })
  const data = run.data

  return (
    <Stack spacing={3}>
      <Box>
        <RoutedLink to="/global-runs">Global runs</RoutedLink>
        <Typography variant="h1" sx={{ mt: 0.5 }}>Global run</Typography>
        {data && <Typography color="text.secondary"><RunDate value={data.created_at} /></Typography>}
      </Box>
      {run.isPending && <CircularProgress size={28} aria-label="Loading global run" />}
      {run.error && <Alert severity="error">{run.error.message}</Alert>}
      {data && (
        <>
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap' }} role="status">
            <Chip label={`${data.results.filter((result) => !isActive(result)).length} of ${data.repository_count} finished`} />
            <Chip color="success" label={`${data.clean_count} clean`} />
            <Chip color="warning" label={`${data.results.filter((result) => severities.some((severity) => result.counts[severity] > 0)).length} with findings`} />
            <Chip label={`${data.results.filter((result) => result.status === 'failed' || result.status === 'not_evaluated').length} incomplete`} />
          </Stack>
          <ResultsTable key={data.id} results={data.results} global />
        </>
      )}
    </Stack>
  )
}

export function RepositoryAnalysisPage() {
  const { repositoryId } = useParams({ from: '/repositories/$repositoryId/analysis' })
  const queryClient = useQueryClient()
  const historyKey = ['analysis-history', repositoryId]
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
