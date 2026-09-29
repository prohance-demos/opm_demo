import theme from '../../config/theme.json' with { type: 'json' }
import { signed, trimN, usd } from '../engine/format.ts'
import type { Delta } from './types.ts'

export const C = theme.color
export const CH = theme.chart

/** A delta chip, or null when there is nothing to compare against.
 *
 *  `goodDown` says the metric is one where less is better: leakage, overtime,
 *  Hours Shortfall, cost loss. The arrow still points the way the number
 *  moved; only the colour flips. */
export function delta(
  cur: number | null,
  prev: number | null,
  fmt: (d: number) => string = d => signed(d),
  goodDown = false,
): Delta | null {
  if (cur == null || prev == null) return null
  const down = cur < prev
  return { text: fmt(cur - prev), dir: down ? 'down' : 'up', tone: down === goodDown ? 'good' : 'bad' }
}

export function moneyDelta(cur: number, prev: number, goodDown = false): Delta | null {
  if (!prev) return null
  const down = cur < prev
  return {
    text: `${cur - prev >= 0 ? '+' : '-'}${usd(Math.abs(cur - prev))}`,
    dir: down ? 'down' : 'up',
    tone: down === goodDown ? 'good' : 'bad',
  }
}

export const round2 = (n: number): number => +n.toFixed(2)

export const scoreRange = (series: number[]): string =>
  series.length ? `${trimN(series[0])} → ${trimN(series[series.length - 1])}` : '0'
