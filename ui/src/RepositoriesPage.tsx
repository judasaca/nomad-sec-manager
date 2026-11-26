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
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLink } from '@tanstack/react-router'
import { useId, useState, type FormEvent } from 'react'
import { analysisHistoryKey, globalRunsKey, isActive, severityBuckets, totalFindings } from './analysisApi'
import { ResultStatus } from './AnalysisResultStatus'
import { repositoriesApi, repositoriesKey, type Repository, type RepositoryWithAnalysis } from './repositoriesApi'
import { severityFill, severityLabels } from './severity'

const RoutedLink = createLink(Link)
const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type RepositoryDialog =
  | { type: 'add' }
  | { type: 'edit' | 'remove'; repository: Repository }

function RepositoryDate({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>
}

function RepositoryRow({
  repository,
  refreshing,
  refreshDisabled,
  onRefresh,
  onOpenDialog,
}: {
  repository: RepositoryWithAnalysis
  refreshing: boolean
  refreshDisabled: boolean
  onRefresh: () => void
  onOpenDialog: (dialog: RepositoryDialog) => void
}) {
  const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null)
  const actionsId = useId()
  const { latest_analysis: analysis, last_commit_sha: commitSha } = repository

  return (
    <TableRow hover>
      <TableCell component="th" scope="row" sx={{ minWidth: 200, maxWidth: 300 }}>
        <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
          <Link href={repository.url} sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {repository.full_name}
          </Link>
          {repository.archived && <Chip label="Archived" size="small" />}
        </Stack>
        {repository.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            title={repository.description}
            sx={{ mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {repository.description}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {repository.stars.toLocaleString()} {repository.stars === 1 ? 'star' : 'stars'}
        </Typography>
      </TableCell>
      <TableCell sx={{ minWidth: 112, maxWidth: 160, overflowWrap: 'anywhere' }}>
        {repository.default_branch}
        <Typography variant="body2" color="text.secondary">
          {repository.commit_count === null
            ? 'Commit count unavailable'
            : `${repository.commit_count.toLocaleString()} ${repository.commit_count === 1 ? 'commit' : 'commits'}`}
        </Typography>
      </TableCell>
      <TableCell>{repository.language ?? '—'}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        {commitSha ? (
          <Link href={`${repository.url}/commit/${commitSha}`} title={repository.last_commit_subject ?? commitSha}>
            <code>{commitSha.slice(0, 12)}</code>
          </Link>
        ) : 'No commits yet'}
        {repository.last_commit_date && (
          <Typography variant="body2" color="text.secondary">
            <RepositoryDate value={repository.last_commit_date} />
          </Typography>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Stack spacing={0.25} sx={{ alignItems: 'flex-start' }}>
          {analysis ? (
            <>
              <ResultStatus result={analysis} />
              <Typography variant="body2" color="text.secondary">
                <RepositoryDate value={analysis.finished_at ?? analysis.created_at} />
              </Typography>
            </>
          ) : <Typography variant="body2" color="text.secondary">No analysis yet</Typography>}
          <RoutedLink
            to="/repositories/$repositoryId/analysis"
            params={{ repositoryId: repository.id }}
            aria-label={`Static analysis for ${repository.full_name}`}
          >
            Static analysis
          </RoutedLink>
        </Stack>
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {analysis?.counts ? totalFindings(analysis.counts).toLocaleString() : <span aria-label="Count unavailable">—</span>}
      </TableCell>
      {severityBuckets.map((severity) => {
        const count = analysis?.counts?.[severity]
        return (
          <TableCell key={severity} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {count === undefined ? <span aria-label="Count unavailable">—</span> : count > 0 ? (
              <Box
                component="span"
                sx={[severityFill(severity), {
                  display: 'inline-block',
                  minWidth: 28,
                  px: 0.75,
                  borderRadius: 1,
                  textAlign: 'center',
                  fontWeight: 700,
                }]}
              >
                {count.toLocaleString()}
              </Box>
            ) : count}
          </TableCell>
        )
      })}
      <TableCell align="right">
        <Button
          id={`${actionsId}-button`}
          size="small"
          aria-label={`Manage ${repository.full_name}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(actionsAnchor)}
          aria-controls={actionsAnchor ? actionsId : undefined}
          onClick={(event) => setActionsAnchor(event.currentTarget)}
        >
          {refreshing ? 'Refreshing…' : 'Manage'}
        </Button>
        <Menu
          anchorEl={actionsAnchor}
          open={Boolean(actionsAnchor)}
          onClose={() => setActionsAnchor(null)}
          slotProps={{ list: { id: actionsId, 'aria-labelledby': `${actionsId}-button` } }}
        >
          <MenuItem disabled={refreshDisabled} onClick={() => {
            setActionsAnchor(null)
            onRefresh()
          }}>
            <ListItemText
              primary="Refresh metadata"
              secondary={<>Last refreshed <RepositoryDate value={repository.metadata_updated_at} /></>}
            />
          </MenuItem>
          <MenuItem onClick={() => {
            setActionsAnchor(null)
            onOpenDialog({ type: 'edit', repository })
          }}>Edit repository</MenuItem>
          <MenuItem sx={{ color: 'error.main' }} onClick={() => {
            setActionsAnchor(null)
            onOpenDialog({ type: 'remove', repository })
          }}>Delete repository</MenuItem>
        </Menu>
      </TableCell>
    </TableRow>
  )
}

function RepositoryEditor({ dialog, onClose }: { dialog: RepositoryDialog; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState(dialog.type === 'add' ? '' : dialog.repository.url)
  const removing = dialog.type === 'remove'
  const title = dialog.type === 'add' ? 'Add repository' : removing ? 'Delete repository' : 'Edit repository'
  const save = useMutation({
    mutationFn: async () => {
      switch (dialog.type) {
        case 'add':
          await repositoriesApi.create(url.trim())
          break
        case 'edit':
          await repositoriesApi.update(dialog.repository.id, url.trim())
          break
        case 'remove':
          await repositoriesApi.remove(dialog.repository.id)
          break
      }
    },
    onSuccess: async () => {
      if (dialog.type === 'remove') {
        const { id } = dialog.repository
        queryClient.removeQueries({ queryKey: [...repositoriesKey, id] })
        queryClient.removeQueries({ queryKey: [...analysisHistoryKey, id] })
        await queryClient.invalidateQueries({ queryKey: globalRunsKey })
      }
      await queryClient.invalidateQueries({ queryKey: repositoriesKey })
      onClose()
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!save.isPending && (removing || url.trim())) save.mutate()
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={save.isPending ? undefined : onClose}
      aria-labelledby="repository-dialog-title"
      aria-describedby={removing ? 'repository-delete-description' : undefined}
    >
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="repository-dialog-title">{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {save.error && <Alert severity="error">{save.error.message}</Alert>}
            {removing ? (
              <DialogContentText id="repository-delete-description">
                Permanently delete <strong>{dialog.repository.full_name}</strong> from the saved repositories
                and delete all of its static analysis reports?
              </DialogContentText>
            ) : (
              <TextField
                autoFocus
                required
                fullWidth
                margin="dense"
                label="GitHub repository"
                placeholder="https://github.com/owner/repository"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={save.isPending}
                slotProps={{ htmlInput: { maxLength: 500, autoCapitalize: 'none', spellCheck: false } }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            color={removing ? 'error' : 'primary'}
            loading={save.isPending}
            disabled={!removing && !url.trim()}
          >
            {dialog.type === 'edit' ? 'Save changes' : title}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

export function RepositoriesPage() {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<RepositoryDialog | null>(null)
  const [search, setSearch] = useState('')
  const repositories = useQuery({
    queryKey: repositoriesKey,
    queryFn: ({ signal }) => repositoriesApi.list(signal),
    refetchInterval: (query) => query.state.data?.some(
      ({ latest_analysis }) => latest_analysis && isActive(latest_analysis),
    ) ? 1500 : false,
    retry: false,
  })
  const refresh = useMutation({
    mutationFn: (repository: Repository) => repositoriesApi.update(repository.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: repositoriesKey }),
  })
  const saved = repositories.data ?? []
  const searchTerm = search.trim().toLowerCase()
  const rows = saved.filter(({ full_name }) => full_name.toLowerCase().includes(searchTerm))

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
      >
        <Typography variant="h1">Repositories</Typography>
        <Button variant="contained" onClick={() => setDialog({ type: 'add' })}>
          Add repository
        </Button>
      </Stack>

      {repositories.isPending && <CircularProgress size={28} aria-label="Loading repositories" />}
      {repositories.error && (
        <Alert severity="error" action={<Button color="inherit" onClick={() => void repositories.refetch()}>Retry</Button>}>
          {repositories.error.message}
        </Alert>
      )}
      {refresh.error && (
        <Alert severity="error" onClose={() => refresh.reset()}>
          {refresh.variables?.full_name} · {refresh.error.message}
        </Alert>
      )}
      {repositories.data?.length === 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h2">No saved repositories</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Add a public GitHub repository to see its branch and commit metadata here.
          </Typography>
        </Paper>
      )}
      {saved.length > 0 && (
        <Stack spacing={1.5}>
          <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              label="Search by repository name"
              type="search"
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ width: { xs: '100%', sm: 300 } }}
            />
            <Typography variant="body2" color="text.secondary" role="status">
              {searchTerm
                ? `${rows.length.toLocaleString()} of ${saved.length.toLocaleString()} repositories`
                : `${saved.length.toLocaleString()} ${saved.length === 1 ? 'repository' : 'repositories'}`}
            </Typography>
          </Stack>
          <TableContainer component={Paper} variant="outlined" role="region" aria-label="Repository list" tabIndex={0}>
            <Table size="small" aria-label="Repositories">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.highlight' }}>
                  <TableCell>Repository</TableCell>
                  <TableCell>Default branch</TableCell>
                  <TableCell>Language</TableCell>
                  <TableCell>Latest commit</TableCell>
                  <TableCell>Latest analysis</TableCell>
                  <TableCell align="right">Total findings</TableCell>
                  {severityBuckets.map((severity) => (
                    <TableCell key={severity} align="right">{severityLabels[severity]}</TableCell>
                  ))}
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((repository) => (
                  <RepositoryRow
                    key={repository.id}
                    repository={repository}
                    refreshing={refresh.isPending && refresh.variables?.id === repository.id}
                    refreshDisabled={refresh.isPending}
                    onRefresh={() => refresh.mutate(repository)}
                    onOpenDialog={setDialog}
                  />
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7 + severityBuckets.length} sx={{ py: 3, color: 'text.secondary' }}>
                      No repositories match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
      {dialog && <RepositoryEditor dialog={dialog} onClose={() => setDialog(null)} />}
    </Stack>
  )
}
