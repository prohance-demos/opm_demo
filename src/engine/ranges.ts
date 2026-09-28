import { DAY_MS, TODAY } from './dataset.ts'
import type { Bucket, DateState, Range } from './types.ts'

export const MMM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const MONTH_FULL = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

export const mondayOf = (t: number): number => {
  const d = new Date(t)
  const off = (d.getUTCDay() + 6) % 7
  return t - off * DAY_MS
}

export function isoWeek(t: number): number {
  const d = new Date(t)
  const th = mondayOf(t) + 3 * DAY_MS
  const jan1 = Date.UTC(new Date(th).getUTCFullYear(), 0, 1)
  return 1 + Math.round((th - mondayOf(jan1) - 3 * DAY_MS) / (7 * DAY_MS))
}

export const fmtDay = (t: number): string => {
  const d = new Date(t)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MMM[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** The window the current filter selection means. */
export function rangeFor(st: DateState): Range {
  if (st.period === 'Yearly') return { a: Date.UTC(st.year, 0, 1), b: Date.UTC(st.year, 11, 31) }
  if (st.period === 'Quaterly') {
    const m = (st.quarter - 1) * 3
    return { a: Date.UTC(st.year, m, 1), b: Date.UTC(st.year, m + 3, 0) }
  }
  if (st.period === 'Monthly')
    return { a: Date.UTC(st.year, st.month, 1), b: Date.UTC(st.year, st.month + 1, 0) }
  return { a: Math.min(st.rangeA, st.rangeB), b: Math.max(st.rangeA, st.rangeB) }
}

/** The equivalent window one step back, used for every delta on screen.
 *
 *  **Equal spans, always.** The current period is usually still running, so its
 *  window is truncated at today while the one before it is complete. Comparing
 *  those two directly made every money and hours delta on the live period wrong
 *  by the ratio of the two lengths: on 28 September, Yearly 2026 covered 270
 *  days against 2025's 365, and Monthly September covered 27 days against
 *  August's 31. Cost Loss read "-$12.83M vs last year" and most of that was the
 *  95 missing days, not an improvement. Percentages survived it, because
 *  numerator and denominator truncate together, which is why it went unnoticed.
 *
 *  So the previous window is cut to exactly as many days as the current one has
 *  actually covered. September 1 to 28 compares against August 1 to 28. A
 *  period that has finished is unaffected, because its elapsed length is its
 *  whole length. */
export function prevRange(st: DateState): Range {
  const r = rangeFor(st)
  const elapsed = Math.min(r.b, TODAY) - r.a
  const same = (a: number): Range => ({ a, b: a + elapsed })
  if (st.period === 'Yearly') return same(Date.UTC(st.year - 1, 0, 1))
  if (st.period === 'Quaterly') return same(Date.UTC(st.year, (st.quarter - 1) * 3 - 3, 1))
  if (st.period === 'Monthly') return same(Date.UTC(st.year, st.month - 1, 1))
  const span = r.b - r.a + DAY_MS
  return { a: r.a - span, b: r.a - DAY_MS }
}

/** How much of a trailing bucket has to have happened before it is drawn.
 *
 *  Dropping every unfinished bucket, which is what this did until 1.10, left
 *  the chart describing a shorter window than the tile above it: on 28
 *  September the Yearly headline covered 271 days and its bars covered 243, so
 *  adding the bars up landed 10% short of the number they sat under.
 *
 *  Drawing every unfinished bucket instead puts two days of a month beside
 *  eleven full ones, and a line that falls to the axis at the right edge reads
 *  as a collapse rather than as a period still running.
 *
 *  So: draw it once most of it has happened. At half, a short bar is obviously
 *  a short bar rather than a crash, and for most of any period the chart and
 *  the tile agree. Below half it is hidden, exactly as before. */
export const PART_BUCKET_MIN = 0.5

/** X-axis granularity: months for a year, ISO weeks for a quarter or month,
 *  days for a custom range. Truncated at TODAY so no empty future buckets.
 *
 *  A trailing bucket is drawn once `PART_BUCKET_MIN` of it has elapsed and
 *  dropped below that. Daily buckets are never partial, so the Weekly view
 *  keeps every day including today. */
const keepPart = (a: number, b: number, end: number): boolean =>
  (end - a + DAY_MS) / (b - a + DAY_MS) >= PART_BUCKET_MIN

export function bucketsFor(st: DateState): Bucket[] {
  const r = rangeFor(st)
  const end = Math.min(r.b, TODAY)
  const out: Bucket[] = []
  if (end < r.a) return out

  if (st.period === 'Yearly') {
    for (let m = 0; m < 12; m++) {
      const a = Date.UTC(st.year, m, 1)
      const b = Date.UTC(st.year, m + 1, 0)
      if (a > end) break
      if (b > end && !keepPart(a, b, end)) break   // too little of it has run
      out.push({ label: `${MMM[m]} ${st.year}`, a, b: Math.min(b, end) })
    }
    return out.length ? out : [{ label: `${MMM[new Date(r.a).getUTCMonth()]} ${st.year}`, a: r.a, b: end }]
  }
  if (st.period === 'Quaterly' || st.period === 'Monthly') {
    for (let mon = mondayOf(r.a); mon <= end; mon += 7 * DAY_MS) {
      const a = Math.max(mon, r.a)
      const b = mon + 6 * DAY_MS
      if (b > end && !keepPart(a, b, end)) break   // too little of it has run
      out.push({ label: `W${isoWeek(mon)}`, a, b: Math.min(b, r.b, end) })
    }
    return out.length ? out : [{ label: `W${isoWeek(r.a)}`, a: r.a, b: end }]
  }
  for (let t = r.a; t <= end; t += DAY_MS) {
    const d = new Date(t)
    out.push({ label: `${d.getUTCDate()} ${MMM[d.getUTCMonth()]}`, a: t, b: t })
  }
  return out
}

/** Label shown on the date picker trigger. A range inside one year prints the
 *  year once, which is both better typography and 45px of filter bar back. */
export function dateLabel(st: DateState): string {
  if (st.period === 'Yearly') return String(st.year)
  if (st.period === 'Quaterly') return `Q${st.quarter} ${st.year}`
  if (st.period === 'Monthly') return `${MMM[st.month]} ${st.year}`
  const a = Math.min(st.rangeA, st.rangeB)
  const b = Math.max(st.rangeA, st.rangeB)
  const sameYear = new Date(a).getUTCFullYear() === new Date(b).getUTCFullYear()
  return `${sameYear ? fmtDay(a).replace(/ \d{4}$/, '') : fmtDay(a)} – ${fmtDay(b)}`
}

/** Rolling eleven weeks for the KPI sparklines.
 *
 *  Anchored on the last week that actually finished. A part week at the right
 *  end holds two or three days against ten full weeks, so an hours or money
 *  line would fall off a cliff at the edge and read as a collapse that has not
 *  happened. Every bucket here is seven days, so the line compares like with
 *  like. */
export function sparkWeeks(st: DateState): Range[] {
  const r = rangeFor(st)
  const end = Math.min(r.b, TODAY)
  let last = mondayOf(end)
  if (last + 6 * DAY_MS > end) last -= 7 * DAY_MS
  const out: Range[] = []
  let mon = last - 10 * 7 * DAY_MS
  for (let i = 0; i < 11; i++, mon += 7 * DAY_MS) out.push({ a: mon, b: mon + 6 * DAY_MS })
  return out
}

export function weekLabel(r: Range): string {
  const a = new Date(r.a)
  const b = new Date(r.b)
  return `${a.getUTCDate()} ${MMM[a.getUTCMonth()]} - ${b.getUTCDate()} ${MMM[b.getUTCMonth()]}`
}
