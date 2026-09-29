/* Calibration guard. Run with:  npm run test:engine
 *
 * Every figure below is what the dashboard prints for Yearly 2026. The three
 * calibration blocks in config/vendors.json are chosen so these come out, and
 * this test is what tells you which one a change moved.
 *
 * Three groups matter more than the rest:
 *
 *   The demo targets. 60% capacity utilization, $40M leakage value, 550K hours
 *   not delivered, 380 Excess FTEs. Those are the numbers the story is told
 *   with, agreed on the 23 Sep review.
 *
 *   The identities. Contract Value minus Verified Cost equals Financial Impact, to the
 *   cent, per vendor and portfolio-wide, or the page is telling three different
 *   stories about the same money. And Leakage Value stays above Financial Impact, so
 *   the two figures on screen do not read as an error.
 *
 *   The floors. No day anywhere is missing a series, and no day prints a
 *   utilization over 100%.
 */
import { DAY_MS, TODAY, VENDOR_NAMES, aggregate, aggregateMany, byName, dayValues } from '../src/engine/dataset.ts'
import { PART_BUCKET_MIN, bucketsFor, prevRange, rangeFor } from '../src/engine/ranges.ts'
import * as F from '../src/engine/formulas.ts'
import { fte, hrs, pct, trimN, usd } from '../src/engine/format.ts'
import type { DateState, Totals } from '../src/engine/types.ts'

const st: DateState = {
  period: 'Yearly', year: 2026, quarter: 3, month: 8,
  rangeA: Date.UTC(2026, 8, 13), rangeB: Date.UTC(2026, 8, 15),
  calY: 2026, calM: 8, gridY: 2016, pick: null,
}
const r = rangeFor(st)

const expected: Record<string, Record<string, string>> = {
  'Adventure Inc': {
    score: '71.6', cu: '68%', eu: '60%', out: '94.7%', sla: '77%', dp: '72.92%',
    expectedHrs: '433.98K hrs', logged: '491.84K hrs', productive: '295.11K hrs',
    leakage: '45.33%', leakValue: '$14.56M', hnd: '138.87K hrs', fteEq: '96', leakFte: '136',
    costLoss: '$10.28M', contractValue: '$32.11M', actual: '$21.84M', cph: '$108.82',
    ot: '7%', otTracked: '34.43K hrs', otClaimed: '46.48K hrs', otFte: '32',
    otBilled: '$3.44M', unprodOt: '$1.02M', idleCost: '$5.1M', idleCap: '32%',
  },
  'CTS Consulting': {
    score: '65.2', cu: '58%', eu: '55%', out: '86.9%', sla: '76%', dp: '66.04%',
    expectedHrs: '839.03K hrs', logged: '884.79K hrs', productive: '486.64K hrs',
    leakage: '47.45%', leakValue: '$21.1M', hnd: '352.39K hrs', fteEq: '244', leakFte: '275',
    costLoss: '$18.68M', contractValue: '$44.47M', actual: '$25.79M', cph: '$91.38',
    ot: '10%', otTracked: '88.48K hrs', otClaimed: '132.72K hrs', otFte: '92',
    otBilled: '$7.03M', unprodOt: '$2.11M', idleCost: '$6.96M', idleCap: '42%',
  },
  InfoSystems: {
    score: '37.19', cu: '42%', eu: '45%', out: '85%', sla: '29.97%', dp: '25.48%',
    expectedHrs: '101.26K hrs', logged: '94.51K hrs', productive: '42.53K hrs',
    leakage: '51.33%', leakValue: '$4.68M', hnd: '58.73K hrs', fteEq: '41', leakFte: '36',
    costLoss: '$5.29M', contractValue: '$9.11M', actual: '$3.83M', cph: '$214.29',
    ot: '15%', otTracked: '14.18K hrs', otClaimed: '28.35K hrs', otFte: '20',
    otBilled: '$2.55M', unprodOt: '$701.76K', idleCost: '$1.4M', idleCap: '58%',
  },
}

let fails = 0
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want)
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(52)} got ${String(got).padEnd(15)} want ${want}`)
}

/* Overtime claimed is always at least overtime tracked.
 *
 *  A vendor bills the client for time at the desk; ProHance counts the part of
 *  it that became work. Logged is never below productive, so a claim below what
 *  was tracked means a vendor under-billing its own overtime, which is not the
 *  story this dashboard is for. Until tracked is derived from productive hours
 *  above the daily threshold and claimed from logged hours above it, the
 *  relationship rests on claimedOtMultiplier in config/vendors.json, so it gets
 *  a test. Agreed with the product owner 28 Sep 2026. */
for (const name of VENDOR_NAMES) {
  const t = aggregate(name, r.a, r.b)
  eq(`${name} claims at least the overtime it worked`,
     F.claimedOvertimeHours(t, name) >= t.ot, true)
}

/* ---- the September 2026 audit: three things that used to be silently wrong -- */

/* 1. Every delta compares equal spans.
 *
 *  The current period is usually still running. Comparing its truncated window
 *  against a complete previous one made every money and hours delta wrong by
 *  the ratio of the two lengths: Financial Impact read "-$12.83M vs last year"
 *  on a Yearly view whose 271 days were being held against 365. */
{
  const periods: [string, DateState][] = [
    ['Yearly 2026',    { ...st, period: 'Yearly',   year: 2026 }],
    ['Yearly 2025',    { ...st, period: 'Yearly',   year: 2025 }],
    ['Quarterly Q3 26',{ ...st, period: 'Quaterly', year: 2026, quarter: 3 }],
    ['Quarterly Q1 26',{ ...st, period: 'Quaterly', year: 2026, quarter: 1 }],
    ['Monthly Sep 26', { ...st, period: 'Monthly',  year: 2026, month: 8 }],
    ['Monthly Aug 26', { ...st, period: 'Monthly',  year: 2026, month: 7 }],
  ]
  const elapsed = (x: { a: number; b: number }) => Math.min(x.b, TODAY) - x.a
  for (const [label, ps] of periods)
    eq(`${label} compares an equal span`,
       elapsed(rangeFor(ps)) === elapsed(prevRange(ps)), true)
}

/* 2. A trailing bucket appears once half of it has run, and not before.
 *
 *  Dropping every unfinished bucket left the chart covering a shorter window
 *  than the tile above it. Drawing every one put two days beside eleven full
 *  months. PART_BUCKET_MIN is the line between the two. */
{
  /* The clock is pinned for this run, so the threshold is checked
     arithmetically rather than by moving the date. */
  const b = bucketsFor({ ...st, period: 'Yearly', year: 2026 })
  const last = b[b.length - 1]
  const span = last.b - last.a + DAY_MS
  const whole = Date.UTC(2026, new Date(last.a).getUTCMonth() + 1, 0) - last.a + DAY_MS
  eq('the trailing bucket drawn has at least half of it elapsed',
     span / whole >= PART_BUCKET_MIN, true)
  eq('no bucket starts after today', b.every(x => x.a <= TODAY), true)
  eq('no bucket ends after today', b.every(x => x.b <= TODAY), true)
}

/* 3. The bars tie out to the tile they sit under.
 *
 *  The chart's buckets must cover the same window the headline aggregates, or
 *  adding the bars up lands somewhere the number above them is not. */
for (const label of ['Yearly', 'Quaterly', 'Monthly'] as const) {
  const ps: DateState = { ...st, period: label }
  const r = rangeFor(ps)
  const b = bucketsFor(ps)
  const covered = b.reduce((a, x) => a + (x.b - x.a + DAY_MS), 0)
  const window = Math.min(r.b, TODAY) - r.a + DAY_MS
  eq(`${label} bars cover the window the tile aggregates`,
     Math.abs(covered - window) <= DAY_MS * 7, true)
}

for (const [name, want] of Object.entries(expected)) {
  const t = aggregate(name, r.a, r.b)
  const got: Record<string, string> = {
    score: trimN(F.vendorScore(t) ?? 0),
    cu: pct(F.capacityUtilization(t)),
    eu: pct(F.effectiveUtilization(t)),
    out: pct(F.outputRate(t)),
    sla: pct(F.slaCompliance(t)),
    dp: pct(F.deliveryPredictability(t)),
    expectedHrs: hrs(t.expected),
    logged: hrs(t.logged),
    productive: hrs(t.productive),
    leakage: pct(F.leakagePct(t)),
    leakValue: usd(F.leakageValue(t, name)),
    hnd: hrs(F.hoursNotDelivered(t)),
    fteEq: fte(F.fteEquivalent(t)),
    leakFte: fte(F.leakageFteEquivalent(t)),
    costLoss: usd(F.costLoss(t, name)),
    contractValue: usd(F.contractValue(t, name)),
    actual: usd(F.billableCost(t, name)),
    cph: `$${trimN(+F.costPerProductiveHour(t, name).toFixed(2))}`,
    ot: pct(F.overtimePct(t)),
    otTracked: hrs(t.ot),
    otClaimed: hrs(F.claimedOvertimeHours(t, name)),
    otFte: fte(F.overtimeFteEquivalent(t, name)),
    otBilled: usd(F.claimedOvertimeCost(t, name)),
    unprodOt: usd(F.unproductiveOvertimeCost(t, name)),
    idleCost: usd(F.idleCost(t, name)),
    idleCap: pct(F.idleCapacity(t)),
  }
  for (const k of Object.keys(want)) eq(`${name} ${k}`, got[k], want[k])
}

/* ---- the numbers the demo is told with ---- */
console.log('')
const all = aggregateMany(VENDOR_NAMES, r.a, r.b)
const sum = (f: (t: ReturnType<typeof aggregate>, n: string) => number) =>
  VENDOR_NAMES.reduce((a, n) => a + f(aggregate(n, r.a, r.b), n), 0)

eq('TARGET capacity utilization ~60%', pct(F.capacityUtilization(all)), '59.98%')
eq('TARGET leakage value ~$40M', usd(sum(F.leakageValue)), '$40.34M')
eq('TARGET Hours Shortfall ~550K', hrs(F.hoursNotDelivered(all)), '550K hrs')
eq('TARGET Excess FTEs north of 300', fte(F.fteEquivalent(all)), '380')
eq('TARGET overtime rate ~9%', pct(F.overtimePct(all)), '9.32%')

/* ---- the identities the page rests on ---- */
console.log('')
let cv = 0, ac = 0, cl = 0
for (const name of VENDOR_NAMES) {
  const t = aggregate(name, r.a, r.b)
  cv += F.contractValue(t, name); ac += F.billableCost(t, name); cl += F.costLoss(t, name)
  eq(`${name}: contract - actual = cost loss`,
     Math.abs(F.contractValue(t, name) - F.billableCost(t, name) - F.costLoss(t, name)) < 1e-6, true)
  eq(`${name}: idle sits inside non-productive`, t.idle <= F.nonProductiveHours(t), true)
  eq(`${name}: overtime sits inside logged`, t.ot <= t.logged, true)
  eq(`${name}: leakage split adds to the total`,
     Math.abs(F.leakageSplit(t).idle + F.leakageSplit(t).nonCore + F.leakageSplit(t).nonBillable
              - F.nonProductiveHours(t)) < 1e-6, true)
  eq(`${name}: designations add to headcount`,
     F.dimensionRows(name, 'designation').reduce((a, x) => a + x.count, 0),
     byName[name].headcount)
}
eq('portfolio: contract - actual = cost loss', Math.abs(cv - ac - cl) < 1e-6, true)
eq('portfolio contract value', usd(cv), '$85.7M')
eq('portfolio actual cost', usd(ac), '$51.46M')
eq('portfolio cost loss', usd(cl), '$34.24M')
eq('LEAKAGE VALUE STAYS ABOVE COST LOSS', sum(F.leakageValue) > cl, true)
eq('no vendor exceeds 100% utilization',
   VENDOR_NAMES.every(n => (F.capacityUtilization(aggregate(n, r.a, r.b)) ?? 0) <= 100), true)
eq('Excess FTEs is additive across vendors',
   fte(VENDOR_NAMES.reduce((a, n) => a + (F.fteEquivalent(aggregate(n, r.a, r.b)) ?? 0), 0)),
   fte(F.fteEquivalent(all)))

/* ---- delivery ---- */
console.log('')
eq('penalty exposure stays small on purpose', usd(F.penaltyExposure(VENDOR_NAMES)), '$450K')
const tf = (v: string) => aggregate(v, r.a, r.b)
const PROJ = F.projectStats(VENDOR_NAMES, tf)
eq('projects at risk', `${PROJ.filter(p => p.atRisk).length} of ${PROJ.length}`, '3 of 6')
eq('contract value at risk', usd(F.contractValueAtRisk(VENDOR_NAMES, tf)), '$37.59M')
/* every project reads in tasks, and its status agrees with its own numbers */
eq('project tasks add up to the vendor', VENDOR_NAMES.every(v => {
  const mine = PROJ.filter(p => p.vendor === v)
  const share = mine.reduce((a, p) => a + p.share, 0)
  return Math.abs(share - 1) < 0.001 &&
    Math.abs(mine.reduce((a, p) => a + p.assigned, 0) - tf(v).target) < mine.length
}), true)
eq('no project is flagged against its own numbers',
   PROJ.every(p => p.atRisk === (p.onTimePct < 70)), true)
eq('one strategic vendor', F.vendorsByTier(VENDOR_NAMES, 'strategic').join(','), 'Adventure Inc')
eq('two tactical vendors', F.vendorsByTier(VENDOR_NAMES, 'tactical').length, 2)
eq('renewals inside the window', F.upcomingRenewals(VENDOR_NAMES).length, 3)
eq('renewals ordered by due date',
   F.upcomingRenewals(VENDOR_NAMES).map(x => x.vendor).join(' < '),
   'InfoSystems < Adventure Inc < CTS Consulting')

/* ---- every dimension resolves on every vendor ---- */
console.log('')
for (const dim of ['skillSet', 'designation', 'project', 'location'] as const) {
  const names = F.sliceNames(VENDOR_NAMES, dim)
  eq(`dimension ${dim} has slices`, names.length > 0, true)
  const bad = VENDOR_NAMES.flatMap(v =>
    F.dimensionRows(v, dim).filter(row =>
      F.sliceEfficiency(aggregate(v, r.a, r.b), v, dim, row.name) == null))
  eq(`dimension ${dim} resolves on every vendor`, bad.length, 0)
}

/* ---- no window anywhere is empty ---- */
console.log('')
const DAY = 86_400_000
let emptyDays = 0, over100 = 0
for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2026, 8, 15); t += DAY) {
  for (const name of VENDOR_NAMES) {
    const d = aggregate(name, t, t)
    if (!(d.expected > 0 && d.logged > 0 && d.target > 0 && d.completed > 0 &&
          d.onTime > 0 && d.idle > 0 && d.ot > 0)) emptyDays++
    if ((F.capacityUtilization(d) ?? 0) > 100) over100++
  }
}
eq('every single day has every series, weekends included', emptyDays, 0)
eq('no single day prints utilization over 100%', over100, 0)

/* ---- every subset stays inside the set it belongs to, every day ----
 *
 *  The vendor arcs move each key on its own path, so a key that is a subset of
 *  another can cross it on a single day even though the year totals are fine.
 *  That is how a day posting a 102% output rate got in. Keys inside one family
 *  share a noise draw for exactly this reason; this walk is what proves it. */
let broken = 0
for (const name of VENDOR_NAMES) {
  for (let t = Date.UTC(2016, 0, 1); t <= Date.UTC(2026, 8, 15); t += DAY) {
    const d = dayValues(name, t)
    if (!d) continue
    if (d.productive > d.expected || d.productive > d.logged ||
        d.idle > d.logged - d.productive || d.ot > d.logged ||
        d.completed > d.target || d.onTime > d.completed) broken++
  }
}
eq('no day breaks a subset relationship, over eleven years', broken, 0)

/* ---- each vendor has a shape, and it is the shape it was given ---- */
console.log('')
const month = (v: string, m: number) =>
  aggregate(v, Date.UTC(2026, m, 1), Date.UTC(2026, m + 1, 0))
const travel = (v: string, f: (t: Totals) => number | null) => {
  const xs = [...Array(8)].map((_, i) => f(month(v, i)) ?? 0)
  return { first: xs[0], last: xs[7], range: Math.max(...xs) - Math.min(...xs) }
}
for (const v of VENDOR_NAMES) {
  eq(`${v} capacity utilization travels`,
     travel(v, F.capacityUtilization).range > 4, true)
}
eq('Adventure Inc is improving',
   travel('Adventure Inc', F.slaCompliance).last >
   travel('Adventure Inc', F.slaCompliance).first, true)
eq('InfoSystems is sliding',
   travel('InfoSystems', F.slaCompliance).last <
   travel('InfoSystems', F.slaCompliance).first, true)
eq('InfoSystems overtime climbs as its delivery falls',
   travel('InfoSystems', F.overtimePct).last >
   travel('InfoSystems', F.overtimePct).first, true)

/* ---- the two metrics that used to print the same number ---- */
console.log('')
for (const v of VENDOR_NAMES) {
  const t = aggregate(v, r.a, r.b)
  const hi = F.highRateUtilization(t, v)
  const eu = F.effectiveUtilization(t) ?? 0
  const allHigh = F.siteRows(t, v).every(x => x.high)
  eq(`${v} high-rate utilization is its own number`,
     allHigh || Math.abs((hi ?? 0) - eu) > 1, true)
}

/* ---- no vendor is structurally unable to show an overworked person ---- */
for (const v of VENDOR_NAMES) {
  const split = F.employeeSplit([v], n => aggregate(n, r.a, r.b))
  eq(`${v} can show an over-utilized employee`, (split.over ?? 0) > 0, true)
  eq(`${v} leaves a balanced middle`,
     (split.over ?? 0) + (split.under ?? 0) < 100, true)
}

console.log(fails ? `\n${fails} mismatches` : '\nall calibration checks passed')
process.exit(fails ? 1 : 0)
