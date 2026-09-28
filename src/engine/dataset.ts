import vendorsCfg from '../../config/vendors.json' with { type: 'json' }
import { h32 } from './noise.ts'
import { TOTAL_KEYS, zeroTotals } from './types.ts'
import type { Personality, Totals, TotalKey, VendorConfig } from './types.ts'

export const DAY_MS = 86_400_000
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** "Today" for the whole app. Nothing after this date has data.
 *
 *  Live by default, so a renewal that falls due actually falls out of the
 *  90-day window, a part-month chart grows a bar each week, and the date picker
 *  lets you pick yesterday. It used to be a constant in `config/vendors.json`,
 *  which meant every countdown, every term-elapsed percentage and the last day
 *  of data drifted one day further from the truth every day.
 *
 *  Three overrides, in order, all for pinning the clock rather than for normal
 *  use. Tests need a fixed day or every expectation would move overnight; a
 *  rehearsal sometimes wants the same screen twice.
 *
 *    window.__PEM_TODAY__     set by the Playwright suite before the page loads
 *    PEM_TODAY                env var, for the Node engine and chart tests
 *    ?today=YYYY-MM-DD        query string, for a pinned demo
 */
function resolveToday(): number {
  const g = globalThis as Record<string, unknown>
  const pinned =
    (typeof g.__PEM_TODAY__ === 'string' ? g.__PEM_TODAY__ : null) ??
    ((g.process as { env?: Record<string, string> } | undefined)?.env?.PEM_TODAY ?? null) ??
    (typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('today')
      : null)
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) {
    const t = utc(pinned)
    if (isFinite(t)) return t
  }
  const n = new Date()
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())
}

export const TODAY = resolveToday()
export const CALIBRATION_YEAR = vendorsCfg.calibrationYear
export const HOURS_PER_FTE_DAY = vendorsCfg.hoursPerFteDay
export const RENEWAL_WINDOW_DAYS = vendorsCfg.renewalWindowDays

/** How much of a full working day each weekday carries.
 *
 *  Weekends are not empty. Support rotas and deployment windows run through
 *  them, and a prototype that returns nothing for a Saturday leaves a filter
 *  combination staring at "No data available". These weights keep the weekend
 *  small enough to read as a weekend on a daily chart and large enough that
 *  every selectable window has numbers in it. Index is getUTCDay(): Sunday 0.
 */
export const DAY_WEIGHT = [0.06, 1, 1, 1, 1, 1, 0.18]

export const VENDORS: VendorConfig[] = vendorsCfg.vendors as VendorConfig[]
export const VENDOR_NAMES: string[] = VENDORS.map(v => v.name)
export const byName: Record<string, VendorConfig> = Object.fromEntries(
  VENDORS.map(v => [v.name, v]),
)

interface Bounds { from: number; to: number }
const bounds: Record<string, Bounds> = Object.fromEntries(
  VENDORS.map(v => [v.name, { from: utc(v.dataFrom), to: utc(v.dataTo) }]),
)

/** The date a vendor's contract comes up for renewal. */
export const renewalOf = (name: string): number => utc(byName[name].contractRenewal)

/** Where a day sits in its year, 0 on 1 January and 1 on 31 December. */
function yearProgress(d: Date): number {
  const y = d.getUTCFullYear()
  const a = Date.UTC(y, 0, 1)
  return (d.getTime() - a) / (Date.UTC(y + 1, 0, 1) - a)
}

/** The vendor's arc across the year, in [-0.5, +0.5], where +0.5 is its best.
 *
 *  improving climbs all year, sliding falls all year, and sagging starts and
 *  ends well with a trough in the middle, which is what a summer of attrition
 *  and a Q4 recovery looks like. */
function arcOf(shape: Personality['shape'], p: number): number {
  switch (shape) {
    case 'improving': return p - 0.5
    case 'sliding': return 0.5 - p
    case 'sagging': return -Math.cos(2 * Math.PI * p) / 2
  }
}

/* ------------------------------------------------------------------ *
 *  Raw daily shape, before calibration.
 *  Bounded by the vendor's first and last data day, weighted by weekday,
 *  with a growth trend, a mild seasonal wave, and the vendor's own arc across
 *  the year so its ratios move rather than sitting on their annual value.
 * ------------------------------------------------------------------ */
function dayRaw(name: string, t: number): Record<TotalKey, number> | null {
  const cfg = byName[name]
  const b = bounds[name]
  if (!cfg || t < b.from || t > b.to || t > TODAY) return null
  const d = new Date(t)
  const dow = d.getUTCDay()

  const di = Math.round(t / DAY_MS)
  const growth = Math.pow(1 + cfg.growth, d.getUTCFullYear() - CALIBRATION_YEAR)
  const season =
    1 + 0.07 * Math.sin((d.getUTCMonth() + 0.5) * (Math.PI / 6)) + 0.03 * Math.cos(dow * 1.7)
  /* One common volume draw per day moves every key together, so a busy day is
   * busy across the board. Each key then deviates only a few percent around
   * it. Drawing the keys independently let a single day's Capacity Utilization
   * swing past 100%, which is not a number this dashboard should ever narrate. */
  const vol = 0.8 + 0.4 * h32(cfg.seed, 0, di)
  const base = growth * season * DAY_WEIGHT[dow] * vol

  /* The vendor's own trajectory. `arc` is where this day sits on it and `wob`
   * is a slow weekly jitter so a trend line reads as measured rather than
   * drawn with a ruler. Both are shared by every key on the day; what differs
   * is how far each key travels, which is what makes the ratios move. */
  const pers = cfg.personality
  const arc = arcOf(pers.shape, yearProgress(d))
  const week = Math.floor(di / 7)
  const wob = pers.wobble * (h32(cfg.seed, 11, week) - 0.5)
  const trend = (key: TotalKey) => {
    const swing = pers.swing[key] ?? 0
    return 1 + swing * arc + swing * wob
  }

  /* Keys that are subsets of one another share a noise draw, so their daily
   * ratio carries no noise at all and moves only along the arc above. Without
   * that, a vendor whose output rate already sits at 94.7% could post a day
   * over 100% from two independent draws pulling opposite ways, which the
   * daily walk in tests/engine.test.ts catches. Capacity, worked hours and
   * tasks are three families: ratios inside a family are arc-only, ratios
   * across families still carry day-to-day texture. */
  const CAPACITY = 1, WORK = 2, TASKS = 3
  const n = (family: number, key: TotalKey) =>
    base * trend(key) * (0.98 + 0.04 * h32(cfg.seed, family, di))

  return {
    expected: n(CAPACITY, 'expected'),
    productive: n(WORK, 'productive'), logged: n(WORK, 'logged'),
    ot: n(WORK, 'ot'), idle: n(WORK, 'idle'),
    target: n(TASKS, 'target'), completed: n(TASKS, 'completed'),
    onTime: n(TASKS, 'onTime'),
  }
}

/* ------------------------------------------------------------------ *
 *  Calibration. Each key is scaled so the vendor's calibration-year sum
 *  equals the figure in config/vendors.json. Yearly 2026 therefore shows
 *  exactly those numbers; every other window is a true sum of the days.
 * ------------------------------------------------------------------ */
const SCALE: Record<string, Record<TotalKey, number>> = {}
for (const cfg of VENDORS) {
  /* Clamped to the calibration year as well as to today. Without the year
     clamp, a live clock in January 2027 would spread one year's configured
     totals across fifteen months and quietly shrink every historical day. */
  const yearEnd = Date.UTC(CALIBRATION_YEAR, 11, 31)
  const end = Math.min(TODAY, bounds[cfg.name].to, yearEnd)
  const sums = Object.fromEntries(TOTAL_KEYS.map(k => [k, 0])) as Record<TotalKey, number>
  for (let t = Date.UTC(CALIBRATION_YEAR, 0, 1); t <= end; t += DAY_MS) {
    const raw = dayRaw(cfg.name, t)
    if (!raw) continue
    for (const k of TOTAL_KEYS) sums[k] += raw[k]
  }
  SCALE[cfg.name] = Object.fromEntries(
    TOTAL_KEYS.map(k => [k, sums[k] > 0 ? (cfg.calibration[k] ?? 0) / sums[k] : 0]),
  ) as Record<TotalKey, number>
}

export function dayValues(name: string, t: number): Record<TotalKey, number> | null {
  const raw = dayRaw(name, t)
  if (!raw) return null
  const f = SCALE[name]
  return Object.fromEntries(TOTAL_KEYS.map(k => [k, raw[k] * f[k]])) as Record<TotalKey, number>
}

/** Full-time-equivalent days of capacity a window covers, weekends weighted
 *  down the same way the data is. One FTE working this window would be paid
 *  for `capacityDays(a, b) * HOURS_PER_FTE_DAY` hours. */
export function capacityDays(a: number, b: number): number {
  let n = 0
  const end = Math.min(b, TODAY)
  for (let t = a; t <= end; t += DAY_MS) n += DAY_WEIGHT[new Date(t).getUTCDay()]
  return n
}

const cache = new Map<string, Totals>()

/** Sum one vendor's days over an inclusive range. */
export function aggregate(name: string, a: number, b: number): Totals {
  const key = `${name}|${a}|${b}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = zeroTotals()
  if (a <= b) {
    for (let t = a; t <= b; t += DAY_MS) {
      const d = dayValues(name, t)
      if (!d) continue
      for (const k of TOTAL_KEYS) out[k] += d[k]
      out.days++
      out.capDays += DAY_WEIGHT[new Date(t).getUTCDay()]
    }
  }
  cache.set(key, out)
  return out
}

/** Sum a set of vendors over an inclusive range. capDays stays the calendar's,
 *  not the sum across vendors, because it measures the window not the roster. */
export function aggregateMany(names: string[], a: number, b: number): Totals {
  const out = zeroTotals()
  for (const n of names) {
    const t = aggregate(n, a, b)
    for (const k of TOTAL_KEYS) out[k] += t[k]
    out.days = Math.max(out.days, t.days)
    out.capDays = Math.max(out.capDays, t.capDays)
  }
  return out
}

export const hasData = (t: Totals): boolean => t.days > 0 && t.logged > 0
