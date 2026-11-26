import type { Theme } from '@mui/material/styles'
import type { SeverityBucket } from './analysisApi'

export const severityLabels: Record<SeverityBucket, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
  unavailable: 'Severity unavailable',
}

export const severityFills = {
  high: { light: '#C81E35', lightText: '#FFF', dark: '#F04454' },
  medium: { light: '#D35410', lightText: '#111', dark: '#FB923C' },
  low: { light: '#B47A00', lightText: '#111', dark: '#FACC15' },
  informational: { light: '#0575B5', lightText: '#FFF', dark: '#38BDF8' },
  unavailable: { light: '#5F6B78', lightText: '#FFF', dark: '#A4AFBB' },
} satisfies Record<SeverityBucket, { light: string; lightText: string; dark: string }>

export function severityFill(severity: SeverityBucket) {
  const fill = severityFills[severity]
  return (theme: Theme) => ({
    backgroundColor: fill.light,
    color: fill.lightText,
    ...theme.applyStyles('dark', { backgroundColor: fill.dark, color: '#111' }),
  })
}
