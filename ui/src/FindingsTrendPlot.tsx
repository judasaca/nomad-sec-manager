import { Box } from '@mui/material'
import { useColorScheme, useTheme } from '@mui/material/styles'
import { useEffect, useRef } from 'react'
import { severityBuckets, type SeverityCounts } from './analysisApi'
import { severityFills, severityLabels } from './severity'

const numberFormat = new Intl.NumberFormat()
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
const runDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const linePatterns = [[], [7, 3], [3, 3], [1, 3], [9, 3, 2, 3]]

type Point = { created_at: string; counts: SeverityCounts }

export function FindingsTrendPlot({
  points,
  selectedIndex,
  onSelect,
}: {
  points: Point[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plotBounds = useRef({ left: 0, right: 0 })
  const theme = useTheme()
  const { mode, systemMode } = useColorScheme()
  const scheme = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const maximum = points.reduce(
      (max, point) => Math.max(max, ...severityBuckets.map((severity) => point.counts[severity])),
      0,
    )
    const targetStep = Math.max(1, maximum / 4)
    const magnitude = 10 ** Math.floor(Math.log10(targetStep))
    const step = Math.ceil(targetStep / magnitude) * magnitude
    const topValue = Math.max(step, Math.ceil(maximum / step) * step)

    function draw(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
      const { width, height } = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.scale(ratio, ratio)
      context.font = `13px ${theme.typography.fontFamily}`
      const axisColor = getComputedStyle(canvas).color
      const left = Math.ceil(context.measureText(numberFormat.format(topValue)).width) + 12
      const right = Math.max(left + 1, width - 10)
      const top = 12
      const bottom = height - 31
      plotBounds.current = { left, right }

      const x = (index: number) => points.length === 1
        ? (left + right) / 2
        : left + index * (right - left) / (points.length - 1)
      const y = (value: number) => bottom - value * (bottom - top) / topValue

      context.textAlign = 'right'
      context.textBaseline = 'middle'
      context.fillStyle = axisColor
      context.strokeStyle = axisColor
      for (let count = 0; count <= topValue; count += step) {
        const row = y(count)
        context.fillText(numberFormat.format(count), left - 8, row)
        context.globalAlpha = 0.2
        context.beginPath()
        context.moveTo(left, row)
        context.lineTo(right, row)
        context.stroke()
        context.globalAlpha = 1
      }

      const tickCount = Math.min(points.length, Math.max(2, Math.floor((right - left) / 104) + 1))
      context.textAlign = 'center'
      for (let tick = 0; tick < tickCount; tick++) {
        const index = tickCount === 1 ? 0 : Math.round(tick * (points.length - 1) / (tickCount - 1))
        const label = dateFormat.format(new Date(points[index].created_at))
        const padding = context.measureText(label).width / 2 + 2
        context.fillText(label, Math.max(padding, Math.min(width - padding, x(index))), bottom + 17)
      }

      const selectedX = x(selectedIndex)
      context.globalAlpha = 0.45
      context.beginPath()
      context.moveTo(selectedX, top)
      context.lineTo(selectedX, bottom)
      context.stroke()
      context.globalAlpha = 1

      severityBuckets.forEach((severity, series) => {
        const color = severityFills[severity][scheme]
        context.strokeStyle = color
        context.fillStyle = color
        context.lineWidth = 2
        context.lineJoin = 'round'
        context.setLineDash(linePatterns[series])
        context.beginPath()
        points.forEach((point, index) => {
          const row = y(point.counts[severity])
          if (index === 0) context.moveTo(x(index), row)
          else context.lineTo(x(index), row)
        })
        context.stroke()
        context.beginPath()
        context.arc(selectedX, y(points[selectedIndex].counts[severity]), 4, 0, 2 * Math.PI)
        context.fill()
      })
    }

    const redraw = () => draw(canvas, context)
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    document.fonts.addEventListener('loadingdone', redraw)
    redraw()
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', redraw)
    }
  }, [points, selectedIndex, scheme, theme.typography.fontFamily])

  function selectAt(clientX: number, canvas: HTMLCanvasElement) {
    const { left, right } = plotBounds.current
    if (right <= left) return
    const offset = clientX - canvas.getBoundingClientRect().left
    const fraction = Math.max(0, Math.min(1, (offset - left) / (right - left)))
    onSelect(Math.round(fraction * (points.length - 1)))
  }

  const selected = points[selectedIndex]
  const selectedCounts = severityBuckets.map((severity) =>
    `${severityLabels[severity]} ${numberFormat.format(selected.counts[severity])}`,
  ).join(', ')

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      role="slider"
      tabIndex={0}
      aria-label="Global run for findings by severity"
      aria-valuemin={1}
      aria-valuemax={points.length}
      aria-valuenow={selectedIndex + 1}
      aria-valuetext={`${runDateFormat.format(new Date(selected.created_at))}, ${selectedCounts}`}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') selectAt(event.clientX, event.currentTarget)
      }}
      onClick={(event) => selectAt(event.clientX, event.currentTarget)}
      onKeyDown={(event) => {
        const last = points.length - 1
        const positions: Record<string, number> = {
          ArrowLeft: Math.max(0, selectedIndex - 1),
          ArrowDown: Math.max(0, selectedIndex - 1),
          ArrowRight: Math.min(last, selectedIndex + 1),
          ArrowUp: Math.min(last, selectedIndex + 1),
          Home: 0,
          End: last,
        }
        if (!Object.hasOwn(positions, event.key)) return
        event.preventDefault()
        onSelect(positions[event.key])
      }}
      sx={{
        display: 'block',
        width: '100%',
        height: { xs: 220, sm: 260 },
        color: 'text.secondary',
        cursor: points.length > 1 ? 'crosshair' : 'default',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    />
  )
}
