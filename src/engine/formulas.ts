import thresholds from '../../config/thresholds.json' with { type: 'json' }
import vendorsCfg from '../../config/vendors.json' with { type: 'json' }
import { ratio } from './format.ts'
import { h32 } from './noise.ts'
import { HOURS_PER_FTE_DAY, RENEWAL_WINDOW_DAYS, DAY_MS, TODAY, byName, renewalOf } from './dataset.ts'
import type { Dimension, ProjectRow, SliceRow, Totals } from './types.ts'

/* ==================================================================== *
 *  Every formula the dashboard uses, in one place.
 *
 *  These were reverse engineered from the shipped ProHance PEM build and
 *  the PEM Metrics workbook. Change one here and the whole app, including
 *  the vendor detail page and the KPI sparklines, follows.
 * ==================================================================== */

/** productive / expected. What the vendor delivered against what was contracted. */
export const capacityUtilization = (t: Totals) => ratio(t.productive, t.expected)

/** productive / logged. What the vendor delivered against the hours it booked. */
export const effectiveUtilization = (t: Totals) => ratio(t.productive, t.logged)

/** The unproductive remainder of logged hours. */
export const gapPct = (t: Totals) => {
  const eu = effectiveUtilization(t)
  return eu == null ? null : 100 - eu
}

/** completed / target. */
export const outputRate = (t: Totals) => ratio(t.completed, t.target)

/** onTime / completed. */
export const slaCompliance = (t: Totals) => ratio(t.onTime, t.completed)

/** Hours booked that were not productive work. */
export const nonProductiveHours = (t: Totals) => Math.max(0, t.logged - t.productive)

/** Leakage: non-productive hours against contracted capacity.
 *  Workbook definition, and the denominator the product owner chose:
 *  the reference point is what you paid for, not what the vendor booked. */
export const leakagePct = (t: Totals) => ratio(nonProductiveHours(t), t.expected)

/** The money behind the leakage percentage. */
export const leakageValue = (t: Totals, vendorName: string) =>
  nonProductiveHours(t) * (byName[vendorName]?.billRate ?? 0)

/** Contracted productive hours the vendor did not deliver. Clamped at zero:
 *  a vendor that over-delivers has no shortfall, it has a surplus. */
export const hoursNotDelivered = (t: Totals) => Math.max(0, t.expected - t.productive)

/** Hours Shortfall, valued at the vendor's rate card. The product calls
 *  this Cost Loss. */
export const costLoss = (t: Totals, vendorName: string) =>
  hoursNotDelivered(t) * (byName[vendorName]?.billRate ?? 0)

/** What you contracted for, at the rate card.
 *  Contract Value - Billable Portfolio Cost = Cost Loss, exactly. */
export const contractValue = (t: Totals, vendorName: string) =>
  t.expected * (byName[vendorName]?.billRate ?? 0)

/** Hours Shortfall expressed as whole people, at 7.5 hours a working day.
 *  Scale-invariant: the same answer whether you look at a week or a year. */
export function fteEquivalent(t: Totals): number | null {
  const cap = t.capDays * HOURS_PER_FTE_DAY
  return cap > 0 ? hoursNotDelivered(t) / cap : null
}

/** Contracted capacity left unused. Workbook definition: 100 - utilization. */
export const idleCapacity = (t: Totals) => {
  const cu = capacityUtilization(t)
  return cu == null ? null : Math.max(0, 100 - cu)
}

/* ---- overtime ------------------------------------------------------ */

/** Overtime as a share of the hours the vendor booked. */
export const overtimePct = (t: Totals) => ratio(t.ot, t.logged)

/** Overtime hours at the rate card. There is no overtime premium: the
 *  contracted rate applies to every hour. */
export const overtimeCost = (t: Totals, vendorName: string) =>
  t.ot * (byName[vendorName]?.billRate ?? 0)

/** The part of overtime that did not turn into productive work. */
export const unproductiveOvertimeCost = (t: Totals, vendorName: string) => {
  const eu = effectiveUtilization(t)
  if (eu == null) return 0
  return t.ot * (1 - eu / 100) * (byName[vendorName]?.billRate ?? 0)
}

/** What the vendor has billed as overtime.
 *
 *  An external feed. In the product this arrives from the client's VMS; here it
 *  is a multiplier on the overtime ProHance actually tracked, so the two sit
 *  side by side and the gap between them is the point: what they claim against
 *  what they worked. */
export const claimedOvertimeHours = (t: Totals, vendorName: string) =>
  t.ot * (byName[vendorName]?.claimedOtMultiplier ?? 1)

export const claimedOvertimeCost = (t: Totals, vendorName: string) =>
  claimedOvertimeHours(t, vendorName) * (byName[vendorName]?.billRate ?? 0)

/** Claimed overtime counted as whole people, at 7.5 hours a working day. The
 *  third distinct FTE figure on the page: capacity not delivered, capacity
 *  wasted inside booked hours, and this, capacity billed on top. */
export function overtimeFteEquivalent(t: Totals, vendorName: string): number | null {
  const cap = t.capDays * HOURS_PER_FTE_DAY
  return cap > 0 ? claimedOvertimeHours(t, vendorName) / cap : null
}

/** Hours tied up in non-productive work, counted as whole people. Different
 *  from fteEquivalent, which counts contracted capacity never delivered. */
export function leakageFteEquivalent(t: Totals): number | null {
  const cap = t.capDays * HOURS_PER_FTE_DAY
  return cap > 0 ? nonProductiveHours(t) / cap : null
}

/* ---- leakage breakdown --------------------------------------------- *
 *  Non-productive hours split three ways for the Leakage Breakdown card.
 *  Idle is measured. The remainder divides between work outside the core
 *  brief and work that is not billable at all, on a fixed split, because the
 *  prototype has no activity taxonomy behind it.
 * -------------------------------------------------------------------- */
export interface LeakageSplit {
  idle: number
  nonCore: number
  nonBillable: number
  total: number
}

export function leakageSplit(t: Totals): LeakageSplit {
  const total = nonProductiveHours(t)
  const idle = Math.min(t.idle, total)
  const rest = Math.max(0, total - idle)
  return { idle, nonCore: rest * 0.58, nonBillable: rest * 0.42, total }
}

export const leakageSplitCost = (t: Totals, vendorName: string): LeakageSplit => {
  const r = byName[vendorName]?.billRate ?? 0
  const s = leakageSplit(t)
  return { idle: s.idle * r, nonCore: s.nonCore * r, nonBillable: s.nonBillable * r, total: s.total * r }
}

/* ---- partner efficiency -------------------------------------------- */

/** What one productive hour actually costs, once the undelivered capacity is
 *  paid for too. Contract value over productive hours, not the rate card. */
export const costPerProductiveHour = (t: Totals, vendorName: string) =>
  t.productive > 0 ? contractValue(t, vendorName) / t.productive : 0

/** Cents of productive work returned for each contracted dollar. */
export const returnPerDollar = (t: Totals) =>
  t.expected > 0 ? t.productive / t.expected : 0

/* ---- contracts and tiers -------------------------------------------- */

export const contractOf = (vendorName: string) => byName[vendorName]?.contract ?? null

export const vendorsByTier = (vendorNames: string[], tier: 'strategic' | 'tactical') =>
  vendorNames.filter(v => byName[v]?.tier === tier)

/** Contract money still unspent. */
export function contractRemaining(vendorName: string): number {
  const c = byName[vendorName]?.contract
  return c ? c.value * (1 - c.burn) : 0
}

export const contractSpent = (vendorName: string): number => {
  const c = byName[vendorName]?.contract
  return c ? c.value * c.burn : 0
}

/** Share of the contract term already elapsed, 0 to 100.
 *
 *  This is what the burn bar is read against: a fill past this mark is money
 *  going out faster than the calendar, which is the whole point of the card and
 *  is why it needs no sentence underneath. */
export function contractElapsed(vendorName: string): number {
  const c = byName[vendorName]?.contract
  if (!c) return 0
  const a = Date.parse(c.from), b = Date.parse(c.to)
  if (!(b > a)) return 0
  return Math.max(0, Math.min(100, ((TODAY - a) / (b - a)) * 100))
}

/** The day the budget runs out at the rate it has been spent.
 *
 *  Derived, not configured. It used to be a date in config/vendors.json, which
 *  let it contradict the burn beside it: Adventure Inc read 91% spent against
 *  93% of its term elapsed, which is under the run rate, while the configured
 *  date said the money ran out a month early. */
export function contractExhausts(vendorName: string): number | null {
  const c = byName[vendorName]?.contract
  if (!c) return null
  const a = Date.parse(c.from)
  const days = (TODAY - a) / DAY_MS
  if (!(days > 0) || !(c.burn > 0)) return null
  const perDay = c.burn / days
  return TODAY + ((1 - c.burn) / perDay) * DAY_MS
}

/* ---- projects -------------------------------------------------------- */

export interface ProjectRef extends ProjectRow { vendor: string }

/** One project, counted in tasks.
 *
 *  Status and the line explaining it used to be two strings in the config, so
 *  a project could be marked at risk beside numbers that said otherwise, and
 *  the explanation was written in units the model does not have ("12 points
 *  under contract"). Everything here is derived from the vendor's own task
 *  counts and the project's share of them, so it is all in tasks, which is
 *  what a delivery head can act on. */
export interface ProjectStats extends ProjectRef {
  assigned: number
  onTime: number
  late: number
  onTimePct: number
  atRisk: boolean
}

export function projectStats(vendorNames: string[], totalsFor: (v: string) => Totals): ProjectStats[] {
  const floor = vendorsCfg.projectOnTimeFloor
  const out: ProjectStats[] = []
  for (const v of vendorNames) {
    const t = totalsFor(v)
    const base = deliveryPredictability(t) ?? 0
    for (const p of byName[v]?.projects ?? []) {
      const assigned = Math.round(t.target * p.share)
      const pct = Math.max(0, Math.min(100, base * p.factor))
      const onTime = Math.round(assigned * (pct / 100))
      out.push({
        ...p, vendor: v,
        assigned, onTime, late: assigned - onTime,
        onTimePct: +pct.toFixed(1),
        atRisk: pct < floor,
      })
    }
  }
  return out
}

export function projectsOf(vendorNames: string[]): ProjectRef[] {
  const out: ProjectRef[] = []
  for (const v of vendorNames) for (const p of byName[v]?.projects ?? []) out.push({ ...p, vendor: v })
  return out
}

/* ---- delivery -------------------------------------------------------- */

export const penaltyExposure = (vendorNames: string[]): number =>
  vendorNames.reduce((a, v) => a + (byName[v]?.penaltyExposure ?? 0), 0)

export const slaBreaches = (vendorNames: string[]): number =>
  vendorNames.reduce((a, v) => a + (byName[v]?.slaBreaches ?? 0), 0)

/** Contract money still sitting against vendors whose delivery is off track.
 *  The delivery lens's headline: how much of what you have committed is riding
 *  on work that is not landing. */
export function contractValueAtRisk(
  vendorNames: string[],
  totalsFor: (v: string) => Totals,
): number {
  const risky = new Set(projectStats(vendorNames, totalsFor).filter(p => p.atRisk).map(p => p.vendor))
  return vendorNames.filter(v => risky.has(v)).reduce((a, v) => a + contractRemaining(v), 0)
}

/** On-time delivery: tasks delivered on time against tasks assigned,
 *  rather than against what was completed. It asks the question a delivery head
 *  actually has, which is whether the work lands, not whether the work that
 *  landed landed on time. */
export const deliveryPredictability = (t: Totals) => ratio(t.onTime, t.target)

/** People whose own overtime crosses the threshold in config/thresholds.json.
 *  Modelled per seat from the vendor's seed, skewed so a healthy average still
 *  hides a tail, which is the whole point of the metric. */
export function overtimeEmployees(vendorNames: string[], totalsFor: (n: string) => Totals): number {
  const limit = thresholds.overtime.employeeThreshold
  let n = 0
  for (const name of vendorNames) {
    const v = byName[name]
    if (!v) continue
    const ot = overtimePct(totalsFor(name))
    if (ot == null || ot <= 0) continue
    for (let i = 0; i < v.headcount; i++) {
      const seat = ot * (0.25 + 2.5 * Math.pow(h32(v.seed, 11, i), 6))
      if (seat > limit) n++
    }
  }
  return n
}

/* ---- contracts ----------------------------------------------------- */

export interface Renewal { vendor: string; due: number; days: number }

/** Contracts coming up for renewal inside the configured window. */
export function upcomingRenewals(vendorNames: string[]): Renewal[] {
  return vendorNames
    .map(v => {
      const due = renewalOf(v)
      return { vendor: v, due, days: Math.round((due - TODAY) / DAY_MS) }
    })
    .filter(r => r.days >= 0 && r.days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.due - b.due)
}

/* ---- money --------------------------------------------------------- */

export const billableCost = (t: Totals, vendorName: string) =>
  t.productive * (byName[vendorName]?.billRate ?? 0)

export const idleCost = (t: Totals, vendorName: string) =>
  t.idle * (byName[vendorName]?.idleRate ?? 0)

/** The weighted headline score. Weights live in config/thresholds.json.
 *  A vendor with no deliveries scores its SLA component as zero rather than
 *  dropping out, which is what the shipped build does. */
export function vendorScore(t: Totals): number | null {
  const cu = capacityUtilization(t)
  if (cu == null) return null
  const w = thresholds.vendorScore
  return w.capacityWeight * cu + w.slaWeight * (slaCompliance(t) ?? 0)
}

/** One delivery location: what it costs an hour and how utilized it is. */
export interface SiteRow {
  name: string
  util: number
  /** this site's own hourly rate, the vendor's card rate times its multiplier */
  usd: number
  /** above the high-rate line in config/vendors.json */
  high: boolean
  /** share of the vendor's roster */
  weight: number
}

export const HIGH_RATE_USD: number = vendorsCfg.highRateUsdPerHour

export function siteRows(t: Totals, vendorName: string): SiteRow[] {
  const eu = effectiveUtilization(t)
  const cfg = byName[vendorName]
  if (eu == null || !cfg) return []
  return cfg.sites.map(s => {
    const usd = cfg.billRate * s.rate
    return {
      name: s.name,
      util: +(eu * s.factor).toFixed(2),
      usd: +usd.toFixed(0),
      high: usd > HIGH_RATE_USD,
      weight: s.weight,
    }
  })
}

/** Utilization of the seats that cost the most.
 *
 *  This used to be the headcount-weighted mean of every site, which is what
 *  effective utilization already is: the weights average to one, so the card
 *  printed 60.01% beside a 60.00% on the same page. It now reads only the
 *  sites above the high-rate line, which is a different number and the one the
 *  name promises. A vendor whose expensive people are its least utilized is
 *  paying a premium for the capacity it uses least. */
export function highRateUtilization(t: Totals, vendorName: string): number | null {
  const rows = siteRows(t, vendorName).filter(r => r.high)
  const w = rows.reduce((a, r) => a + r.weight, 0)
  if (!rows.length || w <= 0) return null
  return +(rows.reduce((a, r) => a + r.util * r.weight, 0) / w).toFixed(2)
}

/** Share of a vendor's roster sitting at a high-rate site. */
export function highRateShare(vendorName: string): number {
  const cfg = byName[vendorName]
  if (!cfg) return 0
  return cfg.sites
    .filter(s => cfg.billRate * s.rate > HIGH_RATE_USD)
    .reduce((a, s) => a + s.weight, 0) * 100
}

export function siteBreakdown(t: Totals, vendorName: string): [string, number][] {
  return siteRows(t, vendorName).map(r => [r.name, r.util] as [string, number])
}

/* ---- Consolidation Levers dimensions -------------------------------- *
 *  One vendor's workforce sliced whichever way you are comparing. Sites carry
 *  a weight rather than a headcount and projects carry neither, so both are
 *  normalised into the same shape here and every dimension reads the same way
 *  downstream.
 * -------------------------------------------------------------------- */
export function dimensionRows(vendorName: string, dim: Dimension): SliceRow[] {
  const cfg = byName[vendorName]
  if (!cfg) return []
  switch (dim) {
    case 'skillSet': return cfg.skills
    case 'designation': return cfg.designations
    case 'location':
      return cfg.sites.map(s => ({
        name: s.name,
        count: Math.round(cfg.headcount * s.weight),
        factor: s.factor,
      }))
    case 'project':
      return cfg.projects.map(p => ({
        name: p.name,
        count: Math.round(cfg.headcount / Math.max(1, cfg.projects.length)),
        factor: p.factor,
      }))
  }
}

/** Efficiency for one slice inside one vendor: productive work against booked
 *  hours, tilted by that slice's factor. The product owner's wording, because a
 *  percentage on a chart has to mean something, and "74% productive" does not. */
export function sliceEfficiency(
  t: Totals, vendorName: string, dim: Dimension, slice: string,
): number | null {
  const eu = effectiveUtilization(t)
  if (eu == null) return null
  const row = dimensionRows(vendorName, dim).find(x => x.name === slice)
  return row ? Math.min(100, eu * row.factor) : null
}

/** Every slice any vendor in scope has on this dimension, in config order. */
export function sliceNames(vendorNames: string[], dim: Dimension): string[] {
  const out: string[] = []
  for (const n of vendorNames) {
    for (const r of dimensionRows(n, dim)) if (!out.includes(r.name)) out.push(r.name)
  }
  return out
}

export const sliceHeadcount = (vendorName: string, dim: Dimension, slice: string): number =>
  dimensionRows(vendorName, dim).find(r => r.name === slice)?.count ?? 0

/** The share of a vendor's roster sitting in one slice, for filtering a whole
 *  vendor column down to one designation. */
export const sliceShare = (vendorName: string, dim: Dimension, slice: string): number => {
  const rows = dimensionRows(vendorName, dim)
  const total = rows.reduce((a, r) => a + r.count, 0)
  const row = rows.find(r => r.name === slice)
  return total > 0 && row ? row.count / total : 1
}

/* ---- badges and status ------------------------------------------- */

export type Tone = 'g' | 'a' | 'r'
export type Badge = ['healthy' | 'watch' | 'critical', 'Healthy' | 'Watch' | 'Critical']

export function scoreTone(score: number | null): [Tone, Badge] {
  const t = thresholds.vendorScore
  if (score == null) return ['r', ['critical', 'Critical']]
  if (score >= t.healthy) return ['g', ['healthy', 'Healthy']]
  if (score >= t.watch) return ['a', ['watch', 'Watch']]
  return ['r', ['critical', 'Critical']]
}

/** Shared band logic: below `healthy` is green, below `watch` is amber. */
function bandBadge(v: number | null, healthy: number, watch: number): Badge {
  if (v == null) return ['healthy', 'Healthy']
  if (v < healthy) return ['healthy', 'Healthy']
  if (v < watch) return ['watch', 'Watch']
  return ['critical', 'Critical']
}

export const leakageBadge = (leak: number | null): Badge =>
  bandBadge(leak, thresholds.leakage.healthy, thresholds.leakage.watch)

/** Kept for the thresholds config, which still carries overtime bands, but the
 *  Overtime Integrity card does not badge: the product pills exactly two
 *  metrics, Vendor Score and Leakage Summary. Wire this up if that changes. */
export const overtimeBadge = (ot: number | null): Badge =>
  bandBadge(ot, thresholds.overtime.healthy, thresholds.overtime.watch)

export interface RiskLevel { level: 'High' | 'Medium' | 'Low'; conds: string[] }

/** Risk level, read off the same Vendor Score the card above it prints.
 *
 *  The old rule fired on two absolute cut-offs, SLA under 90 and utilization
 *  over 85. No vendor in a portfolio running at 60% utilization can cross the
 *  second one, and every vendor is under the first, so all three read Medium
 *  and At-Risk Vendors read 0 with a vendor scoring 37. The metric roadmap
 *  already flags this rule as broken ("one fires on both Util > 85% and
 *  Util <= 85%") and asks for one verdict rather than three. This is that: the
 *  score's own bands, so the pill and the score can never disagree. */
export function riskStatus(t: Totals): RiskLevel | null {
  const score = vendorScore(t)
  const cu = capacityUtilization(t)
  const sla = slaCompliance(t)
  if (score == null || cu == null || sla == null) return null
  const b = thresholds.vendorScore
  const conds = [`Utilization ${Math.round(cu)}%`, `SLA ${Math.round(sla)}%`]
  if (score >= b.healthy) return { level: 'Low', conds }
  if (score >= b.watch) return { level: 'Medium', conds }
  return { level: 'High', conds }
}

/* ---- per-seat utilization ----------------------------------------- *
 *  Over and Under Utilized Employee are shares of people, not of hours.
 *  Each seat gets a deterministic draw around its vendor's effective
 *  utilization for the window; seats whose vendor has no data in the
 *  window are excluded rather than counted as under-utilized.
 * -------------------------------------------------------------------- */
export interface EmployeeSplit { over: number | null; under: number | null }

/** A seat's own utilization, drawn around its vendor's mean.
 *
 *  The draw used to be uniform between a tenth and 2.15 times the mean, which
 *  put as many people at 6% as at 120% and left 79% of a vendor's roster
 *  outside the healthy band. Worse, it capped a seat at 2.15 times the mean, so
 *  InfoSystems at 45% could not produce a single person over 100% and the worst
 *  vendor in the book reported that nobody was overworked. This is lognormal
 *  instead: most people near the mean, a thin right tail of people carrying too
 *  much, and no ceiling that depends on the vendor's average. `utilizationSpread`
 *  in config/vendors.json is how scattered a vendor's own seats are. */
function seatUtilization(mean: number, sigma: number, seed: number, i: number): number {
  // Irwin-Hall of four draws, normalised: bell-shaped, no Math.random anywhere
  const z = (h32(seed, 9, i) + h32(seed, 10, i) + h32(seed, 12, i) + h32(seed, 13, i) - 2)
    / 0.5773502691896258
  // exp(sigma z - sigma^2 / 2) has mean 1, so the roster still averages `mean`
  return mean * Math.exp(sigma * z - (sigma * sigma) / 2)
}

export function employeeSplit(
  vendorNames: string[],
  totalsFor: (name: string) => Totals,
): EmployeeSplit {
  const cfg = thresholds.employeeUtilization
  let over = 0, under = 0, n = 0
  for (const name of vendorNames) {
    const v = byName[name]
    if (!v) continue
    const t = totalsFor(name)
    const eu = effectiveUtilization(t)
    if (eu == null || t.logged <= 0) continue
    const sigma = v.personality.utilizationSpread
    for (let i = 0; i < v.headcount; i++) {
      const u = seatUtilization(eu, sigma, v.seed, i)
      if (u > cfg.overAt) over++
      if (u < cfg.underAt) under++
      n++
    }
  }
  return n ? { over: (over / n) * 100, under: (under / n) * 100 } : { over: null, under: null }
}
