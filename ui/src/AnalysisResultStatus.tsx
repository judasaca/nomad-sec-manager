import {
  Alert, Chip, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Button, Stack, SvgIcon, Tooltip,
} from '@mui/material'
import { useId, useState } from 'react'
import type { AnalysisSummary } from './analysisApi'

export const statusLabels: Record<AnalysisSummary['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  clean: 'Clean',
  findings: 'Findings',
  not_evaluated: 'Not evaluated',
  failed: 'Failed',
  incomplete: 'Incomplete',
}

const explanations: Record<AnalysisSummary['status'], string> = {
  queued: 'The scan is waiting to start.',
  running: 'The scan is in progress.',
  clean: 'At least one check passed and no findings were reported.',
  findings: 'The scan reported security findings.',
  not_evaluated: 'All checks were skipped.',
  failed: 'All checks failed or the scan stopped before it could produce a report.',
  incomplete: 'No check completed successfully and at least one could not be evaluated or failed.',
}

export const stepLabels: Record<string, string> = {
  'ci-cd': 'CI/CD',
  'python-dependencies': 'Python dependencies',
  'npm-dependencies': 'npm dependencies',
  'repository-settings': 'Repository settings',
  docker: 'Docker',
}

const diagnosticLabels = { error: 'Failed', not_evaluated: 'Not evaluated', skipped: 'Skipped' }

export function ResultStatus({ result }: { result: AnalysisSummary }) {
  const [open, setOpen] = useState(false)
  const dialogTitle = useId()
  const color = {
    clean: 'success',
    findings: 'warning',
    failed: 'error',
    running: 'info',
    queued: 'default',
    not_evaluated: 'default',
    incomplete: 'warning',
  } as const
  const hasError = Boolean(result.error) || result.diagnostics.some((step) => step.status === 'error')
  const hasWarning = result.diagnostics.some((step) => step.status === 'not_evaluated')
  const hasDetails = hasError || result.diagnostics.length > 0
  const label = statusLabels[result.status]
  const tooltip = [
    explanations[result.status],
    hasError && result.status !== 'failed' && 'Some checks failed.',
    hasWarning && 'Some checks could not be evaluated.',
    hasDetails && 'Open for details.',
  ].filter(Boolean).join(' ')

  return (
    <>
      <Tooltip title={tooltip} describeChild>
        <Chip
          size="small"
          color={color[result.status]}
          clickable={hasDetails}
          onClick={hasDetails ? () => setOpen(true) : undefined}
          aria-haspopup={hasDetails ? 'dialog' : undefined}
          aria-label={hasDetails ? `${label} — view scan status details` : undefined}
          label={(
            <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <span>{label}</span>
              {hasError && (
                <SvgIcon aria-hidden sx={{ fontSize: 16, color: 'error.main' }}>
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
                </SvgIcon>
              )}
              {hasWarning && (
                <SvgIcon aria-hidden sx={{ fontSize: 18 }}>
                  <path d="M12 3 2 20h20L12 3Z" fill="#FFC247" stroke="#3D2100" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 9v4" stroke="#3D2100" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="16.5" r="1" fill="#3D2100" />
                </SvgIcon>
              )}
            </Stack>
          )}
        />
      </Tooltip>
      {open && (
        <Dialog open onClose={() => setOpen(false)} aria-labelledby={dialogTitle} fullWidth maxWidth="sm">
          <DialogTitle id={dialogTitle}>Scan status for {result.repository_name}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1.5}>
              <DialogContentText>{explanations[result.status]}</DialogContentText>
              {result.error && <Alert severity="error">{result.error}</Alert>}
              {result.diagnostics.map(({ name, status, message }) => (
                <Alert key={name} severity={status === 'error' ? 'error' : status === 'skipped' ? 'info' : 'warning'}>
                  <strong>{stepLabels[name] ?? name} · {diagnosticLabels[status]}</strong>
                  <div>{message}</div>
                </Alert>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
        </Dialog>
      )}
    </>
  )
}
