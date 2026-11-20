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
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLink } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import { analysisHistoryKey, globalRunsKey } from './analysisApi'
import { repositoriesApi, type Repository } from './repositoriesApi'

const repositoriesKey = ['repositories']
const RoutedButton = createLink(Button)
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

function Metadata({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  )
}

function RepositoryCard({
  repository,
  refreshing,
  refreshDisabled,
  onRefresh,
  onOpenDialog,
}: {
  repository: Repository
  refreshing: boolean
  refreshDisabled: boolean
  onRefresh: () => void
  onOpenDialog: (dialog: RepositoryDialog) => void
}) {
  const commitSha = repository.last_commit_sha
  return (
    <Paper component="article" variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { md: 'flex-start' }, justifyContent: 'space-between' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography component="h2" variant="h3" sx={{ overflowWrap: 'anywhere' }}>
                <Link href={repository.url}>{repository.full_name}</Link>
              </Typography>
              {repository.archived && <Chip label="Archived" size="small" />}
            </Stack>
            {repository.description && (
              <Typography color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                {repository.description}
              </Typography>
            )}
          </Box>
          <Stack direction="row" useFlexGap sx={{ gap: 0.5, flexWrap: 'wrap', flexShrink: 0 }}>
            <RoutedButton
              size="small"
              to="/repositories/$repositoryId/analysis"
              params={{ repositoryId: repository.id }}
            >
              Static analysis
            </RoutedButton>
            <Button size="small" onClick={onRefresh} disabled={refreshDisabled}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button size="small" onClick={() => onOpenDialog({ type: 'edit', repository })}>
              Edit
            </Button>
            <Button size="small" color="error" onClick={() => onOpenDialog({ type: 'remove', repository })}>
              Delete
            </Button>
          </Stack>
        </Stack>

        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
            gap: 2,
            m: 0,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Metadata label="Default branch">{repository.default_branch}</Metadata>
          <Metadata label="Commits on default branch">
            {repository.commit_count?.toLocaleString() ?? 'Unavailable'}
          </Metadata>
          <Metadata label="Language">{repository.language ?? 'Unspecified'}</Metadata>
          <Metadata label="Stars">{repository.stars.toLocaleString()}</Metadata>
          <Metadata label="Latest commit">
            {commitSha ? (
              <>
                <Link href={`${repository.url}/commit/${commitSha}`} title={commitSha}>
                  <code>{commitSha.slice(0, 12)}</code>
                </Link>
                {repository.last_commit_subject && <> · {repository.last_commit_subject}</>}
              </>
            ) : 'No commits yet'}
          </Metadata>
          {repository.last_commit_date && (
            <Metadata label="Commit date"><RepositoryDate value={repository.last_commit_date} /></Metadata>
          )}
          <Metadata label="Metadata refreshed"><RepositoryDate value={repository.metadata_updated_at} /></Metadata>
        </Box>
      </Stack>
    </Paper>
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
  const repositories = useQuery({
    queryKey: repositoriesKey,
    queryFn: ({ signal }) => repositoriesApi.list(signal),
    retry: false,
  })
  const refresh = useMutation({
    mutationFn: (repository: Repository) => repositoriesApi.update(repository.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: repositoriesKey }),
  })

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
      {repositories.data?.map((repository) => (
        <RepositoryCard
          key={repository.id}
          repository={repository}
          refreshing={refresh.isPending && refresh.variables?.id === repository.id}
          refreshDisabled={refresh.isPending}
          onRefresh={() => refresh.mutate(repository)}
          onOpenDialog={setDialog}
        />
      ))}
      {dialog && <RepositoryEditor dialog={dialog} onClose={() => setDialog(null)} />}
    </Stack>
  )
}
