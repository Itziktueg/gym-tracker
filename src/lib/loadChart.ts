import type { Chart as ChartType, ChartConfiguration } from 'chart.js'

/**
 * Chart.js is ~200kB and most sessions never open a chart, so it is loaded on
 * demand. Vite code-splits the dynamic import into its own chunk, leaving the
 * startup bundle unchanged. The promise is cached so it downloads once.
 */
let pending: Promise<typeof import('chart.js/auto')> | null = null

export function loadChart() {
  pending ??= import('chart.js/auto')
  return pending
}

export type { ChartType, ChartConfiguration }

/** Muted chart chrome, resolved from the page so it matches the app. */
export const AXIS = '#9ca3af'
export const GRID = '#e5e7eb'

/** Draws a value inside each bar/segment, skipping ones too small to read. */
export const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: ChartType) {
    const { ctx } = chart
    ctx.save()
    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    chart.data.datasets.forEach((_ds, i) => {
      const meta = chart.getDatasetMeta(i)
      if (meta.hidden) return
      meta.data.forEach((el, j) => {
        const raw = chart.data.datasets[i].data[j] as number
        if (!raw) return
        const { x, y } = el.getProps(['x', 'y'], true)
        // @ts-expect-error bar elements expose their base for height
        const base = el.base as number
        const size = Math.abs(base - y)
        if (size < 16) return          // too thin to hold a label
        ctx.fillStyle = '#ffffff'
        ctx.fillText(Math.round(raw).toLocaleString(), x, (y + base) / 2)
      })
    })
    ctx.restore()
  },
}
