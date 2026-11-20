import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'

const checks = [
  {
    repository: 'nomad-gui',
    branch: 'main',
    check: 'Dependency policy',
    status: 'Passed',
  },
  {
    repository: 'nomad-distro',
    branch: 'develop',
    check: 'Container policy',
    status: 'Needs review',
  },
  {
    repository: 'nomad-docs',
    branch: 'main',
    check: 'Configuration review',
    status: 'Queued',
  },
  {
    repository: 'nomad-infrastructure',
    branch: 'main',
    check: 'Required metadata',
    status: 'Failed',
  },
] as const

const statusColors = {
  Passed: 'success',
  'Needs review': 'warning',
  Queued: 'info',
  Failed: 'error',
} as const

type CheckStatus = keyof typeof statusColors

function StatusChip({ status }: { status: CheckStatus }) {
  return (
    <Chip
      label={status}
      size="small"
      color={statusColors[status]}
      variant="outlined"
    />
  )
}

const defaultSettings = {
  repository: 'nomad-gui',
  branch: 'main',
  includeDependencies: true,
  notify: false,
}

function ScanSettings() {
  const [settings, setSettings] = useState(defaultSettings)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  return (
    <Card
      component="section"
      aria-labelledby="scan-settings-title"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography id="scan-settings-title" variant="h2">
            Scan settings
          </Typography>
          <Typography color="text.secondary">
            Configure a sample repository check.
          </Typography>
        </Box>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            setDialogOpen(true)
          }}
        >
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                id="preview-repository"
                label="Repository"
                size="small"
                required
                fullWidth
                value={settings.repository}
                onChange={(event) =>
                  setSettings({ ...settings, repository: event.target.value })
                }
              />
              <TextField
                id="preview-branch"
                label="Branch"
                size="small"
                select
                value={settings.branch}
                onChange={(event) =>
                  setSettings({ ...settings, branch: event.target.value })
                }
                sx={{ minWidth: { sm: 144 } }}
              >
                <MenuItem value="main">main</MenuItem>
                <MenuItem value="develop">develop</MenuItem>
              </TextField>
            </Stack>
            <Stack
              direction="row"
              sx={{ flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 2 }}
            >
              <FormControlLabel
                label="Include dependencies"
                control={
                  <Checkbox
                    checked={settings.includeDependencies}
                    onChange={(_, checked) => {
                      setSettings({ ...settings, includeDependencies: checked })
                    }}
                  />
                }
              />
              <FormControlLabel
                label="Notify on completion"
                control={
                  <Switch
                    color="secondary"
                    checked={settings.notify}
                    onChange={(_, checked) => {
                      setSettings({ ...settings, notify: checked })
                    }}
                  />
                }
              />
            </Stack>
            <Divider />
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                type="submit"
                disabled={!settings.repository.trim()}
              >
                Review settings
              </Button>
              <Button
                variant="outlined"
                onClick={() => setSettings(defaultSettings)}
              >
                Reset
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Stack>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        aria-labelledby="preview-dialog-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="preview-dialog-title">
          Review sample settings
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Check {settings.repository.trim()} on the {settings.branch} branch.
          </DialogContentText>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Dependencies{' '}
            {settings.includeDependencies ? 'included' : 'excluded'} ·
            Notifications {settings.notify ? 'on' : 'off'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setDialogOpen(false)
              setSaved(true)
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={saved}
        autoHideDuration={5000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setSaved(false)
        }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSaved(false)}
        >
          Sample settings confirmed.
        </Alert>
      </Snackbar>
    </Card>
  )
}

function StatusAndFeedback() {
  return (
    <Card
      component="section"
      aria-labelledby="status-feedback-title"
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography id="status-feedback-title" variant="h2">
            Status and feedback
          </Typography>
          <Typography color="text.secondary">
            Check states, alerts, and progress.
          </Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {(Object.keys(statusColors) as CheckStatus[]).map((status) => (
            <StatusChip key={status} status={status} />
          ))}
        </Stack>
        <Alert severity="warning">One sample check needs review.</Alert>
        <Box>
          <Stack
            direction="row"
            sx={{
              justifyContent: 'space-between',
              alignItems: 'baseline',
              mb: 1,
            }}
          >
            <Typography id="preview-progress-label" sx={{ fontWeight: 600 }}>
              Sample scan progress
            </Typography>
            <Typography variant="body2" color="text.secondary">
              65%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            aria-labelledby="preview-progress-label"
            value={65}
            sx={{ height: 6, borderRadius: 1 }}
          />
        </Box>
      </Stack>
    </Card>
  )
}

function SampleChecks() {
  const [filter, setFilter] = useState<'all' | 'passed' | 'attention'>('all')

  const visibleChecks = checks.filter(({ status }) => {
    if (filter === 'passed') return status === 'Passed'
    if (filter === 'attention')
      return status === 'Needs review' || status === 'Failed'
    return true
  })

  return (
    <Card component="section" aria-labelledby="sample-checks-title">
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 } }}>
        <Typography id="sample-checks-title" variant="h2">
          Sample checks
        </Typography>
        <Tabs
          value={filter}
          onChange={(_, value: typeof filter) => setFilter(value)}
          aria-label="Filter sample checks"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mt: 0.5,
            '& .MuiTab-root': {
              minWidth: { xs: 0, sm: 90 },
              px: { xs: 1, sm: 2 },
            },
          }}
        >
          <Tab
            value="all"
            id="sample-tab-all"
            aria-controls="sample-check-results"
            label="All checks"
          />
          <Tab
            value="passed"
            id="sample-tab-passed"
            aria-controls="sample-check-results"
            label="Passed"
          />
          <Tab
            value="attention"
            id="sample-tab-attention"
            aria-controls="sample-check-results"
            label="Needs attention"
          />
        </Tabs>
      </Box>
      <TableContainer
        id="sample-check-results"
        role="tabpanel"
        aria-labelledby={`sample-tab-${filter}`}
        tabIndex={0}
      >
        <Table
          aria-label="Sample security checks"
          sx={{
            '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } },
            '& .MuiTableCell-root:first-of-type': { pl: { xs: 1.5, sm: 3 } },
            '& .MuiTableCell-root:last-of-type': { pr: { xs: 1.5, sm: 3 } },
          }}
        >
          <TableHead sx={{ bgcolor: 'background.highlight' }}>
            <TableRow>
              <TableCell>Repository</TableCell>
              <TableCell>Branch</TableCell>
              <TableCell>Check</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleChecks.map(({ repository, branch, check, status }) => (
              <TableRow
                key={repository}
                hover
                sx={{ '&:last-child > *': { borderBottom: 0 } }}
              >
                <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                  {repository}
                </TableCell>
                <TableCell>{branch}</TableCell>
                <TableCell>{check}</TableCell>
                <TableCell>
                  <StatusChip status={status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  )
}

export function ComponentPreview() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1" sx={{ mb: 0.5 }}>
          Component preview
        </Typography>
        <Typography color="text.secondary">
          Explore the NOMAD theme with sample controls and security check
          results.
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 3fr) minmax(0, 2fr)',
          },
        }}
      >
        <ScanSettings />
        <StatusAndFeedback />
      </Box>
      <SampleChecks />
    </Stack>
  )
}
