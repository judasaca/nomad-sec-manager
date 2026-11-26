import { Chip } from '@mui/material'
import type { AnalysisSummary } from './analysisApi'

export const statusLabels: Record<AnalysisSummary['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  clean: 'Clean',
  findings: 'Findings',
  not_evaluated: 'Not evaluated',
  failed: 'Failed',
}

export function ResultStatus({ result }: { result: AnalysisSummary }) {
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
