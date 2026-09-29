# ProHance PEM prototype

A working replica of the ProHance PEM dashboards, rebuilt so the data, the pages,
the metrics and the roles are all configuration rather than code.

Read this file before changing anything. It explains the rules that keep the
project honest and where each kind of change belongs.

Current version is in `VERSION.md`. Add an entry there for anything that changes
behaviour, one line, newest first.

## The five rules

**1. Numbers come from the engine, never from a literal in a component.**
There is exactly one source of data: a deterministic daily series per vendor in
`src/engine/dataset.ts`. Every figure on every screen is an aggregation of those
days through a formula in `src/engine/formulas.ts`. If you find yourself typing a
percentage into a `.tsx` file, stop: the value belongs in a formula or in
`config/vendors.json`.

**2. `npm run verify` must stay green.**
`test:engine` pins every headline figure for Yearly 2026 and the identities the
Cost Efficiency page rests on, above all **Contract Value minus Verified
Cost equals Financial Impact**, per vendor and across the portfolio. If those
three numbers stop agreeing, the page is telling three stories about the same
money. `test:charts` pins the axis ladder and the column
geometry. The Playwright suite drives every filter and guards every defect the
September audit found. If a change moves one of those on purpose, update the
expectation in the same commit and say why in `VERSION.md`.

**3. The clock is live, and every window compares against an equal span.**
`TODAY` in `src/engine/dataset.ts` is the real date. It was a constant in
`config/vendors.json` until 1.10, which meant renewal countdowns, term-elapsed
percentages and the last day of data drifted one day further from the truth
every day, and a renewal that fell due never left the 90-day window. Three
overrides pin it for a test run or a rehearsal: `window.__PEM_TODAY__`, the
`PEM_TODAY` env var, and `?today=YYYY-MM-DD`. Both Node test runners and the
Playwright suite pin 2026-09-15, which is why every expectation in them is still
a constant.

`prevRange` cuts the previous window to as many days as the current one has
actually covered, because the current period is usually still running. Without
that, Financial Impact read "-$12.83M vs last year" on a Yearly view holding 271
days against 365, and Monthly read roughly minus half of everything. Ratios hid
it, because numerator and denominator truncate together. `test:engine` asserts
equal spans on six periods.

**4. No screen may ever print "No data available", and no percentage may ever
exceed 100.**
Production has empty cells for reasons a prototype does not get to borrow. Four
things hold this: every calendar day carries data including weekends
(`DAY_WEIGHT` in `dataset.ts`), the date pickers refuse the future, the vertical
filter will not go below one selection, and every vendor has every series. What
stops a single day crossing 100 is that keys which are subsets of one another
share a noise draw, so their daily ratio moves only along the vendor's arc:
capacity, worked hours and tasks are three families in `dayRaw`. `test:engine`
walks every day of eleven years checking that no subset escapes its set, and
`test:ui` sweeps every period on every lens.

**5. Never put a CSS class on an SVG element without checking the stylesheet.**
In SVG 2 the CSS geometry properties (`height`, `width`, `x`, `y`) apply to
shapes and **override the presentation attribute**. A `.bar` rule written for the
progress bars silently collapsed every column chart to 7px, and an automated
check reading the `height` attribute could not see it. Chart classes are
prefixed `col-`, and the Playwright suite measures rendered `getBBox()`.

## Commands

```
npm install            once
npm run dev            hot-reloading dev server on :5173
npm run build          type check and production build
npm run test:engine    calibration guard, no browser, ~1s
npm run test:charts    axis ladder and column geometry, no browser, ~1s
npm run test:ui        Playwright suite (npx playwright install chromium first)
npm run verify         all of the above
npm run standalone     one self-contained HTML in dist-standalone/
```

`PW_CHROMIUM=/path/to/chromium` makes the UI tests use a browser you already have.

## Where things live

```
config/           everything a product person edits, no code
  vendors.json      vendors, headcount, rate card, calibration totals, the
                    locations with their own rates, designations, skills,
                    projects, contract term and burn, penalty exposure, SLA
                    breaches, tier, and each vendor's personality
  verticals.json    the vertical list
  lenses.json       the dashboard pages: hero tiles and metric sections per page
  roles.json        role-based views: landing page, visible pages, hidden metrics
  copy.json         every label and tooltip, keyed by metric id
  thresholds.json   badge cut-offs, score weights, risk rules, the seat model
  theme.json        colours, fonts, radius, sheet width (1100: an iPad Air in
                    landscape renders it at 100% with no zoom)

src/engine/       the dataset and the maths
  dataset.ts        daily series generation and calibration
  ranges.ts         periods, previous periods, chart buckets
  formulas.ts       every metric formula, one function each
  format.ts         how a number reads on screen
  noise.ts          the seeded hash; there is no Math.random anywhere

src/metrics/      the bridge between formulas and the screen
  registry.ts       one entry per metric: how it computes as a card, a hero
                    tile and a Vendor Profiles row
  types.ts          the view models a metric may return
  context.ts        builds the totals, previous totals and buckets a metric needs
  spark.ts          the rolling eleven-week KPI sparkline series

src/components/   presentation only, no arithmetic
src/pages/        LensPage renders every lens; VendorDetail is the drilldown
src/state/        filter state per page, role, routing
tests/            engine.test.ts (calibration), charts.test.ts (geometry),
                  ui.spec.ts (filters and audit regressions)
scripts/          build-standalone.mjs
docs/             DATA-MODEL.md, the UI audit, and the formula reference
VERSION.md        what changed in which version
```

## How to make each kind of change

### Change a number
Edit that vendor's `calibration` block in `config/vendors.json`. Those are the
totals the year-to-date window must sum to; every other window rescales with
them. Then run `npm run test:engine` and update the expectation you moved.

### Add a vendor
Copy a block in `config/vendors.json`, give it a new `id`, `name` and a `seed`
that no other vendor uses (the seed is what makes its series different). Set
`dataFrom` and `dataTo` to bound when it has data, and add a `logo` key that
exists in `src/components/Icons.tsx` (or use `"generic"`). Nothing else changes.

### Add a vertical
Add it to `config/verticals.json` and set `vertical` on the vendors that belong
to it. The filter bar and the empty state follow automatically.

### Add a metric
1. If it needs new maths, add a pure function to `src/engine/formulas.ts`.
2. Add an entry to `METRICS` in `src/metrics/registry.ts` with a `card` function
   returning one of the view shapes in `src/metrics/types.ts`, and a `hero`
   function if it should also be a KPI tile.
3. Add its label and tooltip to `config/copy.json` under the same id.
4. List the id in a lens's `sections` or `hero` array in `config/lenses.json`.

If your metric needs a visual shape that does not exist yet, add an interface to
`src/metrics/types.ts` and a matching `case` in
`src/components/MetricSection.tsx`. Reusing an existing shape needs no component
change at all.

### Add a full-width band below the vendor grid
A metric that only means something across vendors cannot live in a vendor
column. Give it a `portfolio` function in the registry returning a view
`MetricSection.tsx` and `PortfolioBand.tsx` can draw, then list its id in a
lens's `portfolioSections` array. Consolidation Levers is the worked example. A
band reads the page filter bar; it does not get a time control of its own.

### Slice by designation, skill, project or location
Those four are one thing in the code: a `Dimension`. `dimensionRows(vendor, dim)`
returns `{ name, count, factor }` for any of them, `sliceEfficiency` applies the
factor and `sliceShare` gives the slice's share of the roster. That is why
Consolidation Levers compares on four dimensions from one Compare by control
rather than four hand-written charts, and why the designation strip on a vendor
card can rescale a whole column: `buildContext` takes `{ dimension, designation }`
and scales the window's totals by that share. To add a fifth dimension, add it to
`DIMENSIONS` in `src/engine/types.ts` and give `dimensionRows` a case. Nothing in
the components changes.

### Add a lens (a new dashboard page)
Append a block to `lenses` in `config/lenses.json`: an `id`, a `navGroup` from
`navGroups`, a `navLabel`, `title`, `subtitle`, `defaultPeriod`, the `hero`
metric ids and the `sections` metric ids. Add it to the `lenses` array of any
role that should see it. No new file is needed; `LensPage` renders it.

### Add a role
Append to `roles` in `config/roles.json` with a `defaultLens`, the `lenses` it
may see and any `hideMetrics` to strip from its pages.

### Change copy or tooltips
`config/copy.json` only. Tooltips are keyed by placement (`hero`, `card`,
`profile`, `detail`) and fall back to `card`. The metric-tooltip spec requires
hero ratio tooltips to end with ", all vendors in view" and vendor-card ratio
tooltips to say "for this vendor"; money, count and status tooltips carry no
scope tail anywhere.

### Change transitions or chart behaviour
Charts are hand-drawn SVG in `src/components/charts/`. The transitions are CSS at
the end of `src/styles/app.css` under "transitions". There is no chart library,
so nothing is off limits. Three things there are load-bearing:

- `niceMax` in `primitives.ts` is the rounding ladder the product's axes land on.
  Every bar height and area path scales with it. `test:charts` pins it.
- **Grouped columns divide a category among the series that have a value in
  it**, never among all of them, which is `groupedColumn` in `primitives.ts`.
  Designations and skills belong to every vendor, so nothing changes there. A
  project belongs to exactly one, and dividing by three reserved two empty slots
  and pushed the one real bar a third of a category off its own label. Six of
  the eight locations had the same defect. `test:charts` pins it.
- `ColumnChart` defaults to `layout="overlay"`, which is how the product draws a
  pair of series: both centred on the category, wide behind and narrow in front,
  never side by side. `layout="grouped"` puts them beside each other, for a chart
  comparing named things rather than two measures of one thing. Both honour
  `maxPointWidth`; without the cap a four-category grouped chart on a full-width
  band draws 90px slabs.
- **Charts measure their own container** (`useMeasure`). The `width` prop is a
  first-paint fallback only. Passing a width computed from `sheetMinWidth` meant
  the viewBox was narrower than the box it drew into on any wide screen, so the
  browser magnified the whole drawing and an 11px label came out at 16.
- `labelFit` in `Grid.tsx` decides flat, cut to the slot, tilted, or tilted and
  thinned, from the real width. The product prints twelve week labels flat
  because its chart is 761px wide; a vendor column is not. **A label is tilted
  only when the tilt fits inside the axis margin.** A tilted label reaches down
  the page by its own length times sin(38 degrees), so a 27-character project
  name reaches 95px against a 40px margin and leaves the card with it. Anything
  that long stays flat and is cut to its slot, full text on hover. `.chart` is
  clipped on both axes as the backstop.
- `bucketsFor` draws an unfinished trailing bucket once **half of it has
  elapsed**, `PART_BUCKET_MIN` in `ranges.ts`, and drops it below that. Dropping
  every one left the chart covering a shorter window than the tile above it: on
  28 September the Yearly headline covered 271 days and its bars covered 243, so
  adding the bars up landed 10% short of the number they sat under. Drawing
  every one puts two days beside eleven full months and the money line falls to
  the axis, which reads as a collapse rather than as a period still running.
  Half is where a short bar is obviously short rather than a crash, and the
  cliff test still passes at exactly that ratio, which is the binding case.
- Column corners are top-only rounded, drawn as a path. A rect with `rx` rounds
  the base too, which reads wrong against the axis.

### Publish it
`npm run standalone` writes `dist-standalone/artifact-body.html`. Publish that
file with the Claude Artifact tool to get a private URL you can share.
`dist-standalone/ProHance-PEM.html` is the same page as a normal document you can
open from disk or attach to an email.

### Change how a filter commits
`src/components/FilterBar.tsx` and `src/components/filters/MultiSelect.tsx`.

Period tabs, date pickers and metric chips commit on click. The two multiselects
stage their change and commit on Apply. Every Reset and Apply disables itself
when it would do nothing, which is what stops them reading as broken. The staged
selection lives in the store, not in the component, so the page-level Apply can
commit it; a button outside a popover must carry `data-keep-pop` or the popover's
outside-click handler closes it before the button's own handler runs.

`emptyMeansAll` decides what an empty selection commits as. Vendors fall back to
everything; verticals do not, because clearing them is a real state that empties
the page.

## Things that are deliberate, not bugs

See `docs/AUDIT-2026-09-23.md` for the full table with reasons.

- There is one risk verdict, and it is the Vendor Score's own band. The old rule
  needed utilization over 85 AND SLA under 90 for High, and SLA under 90 for
  Medium. In a portfolio running at 60% utilization no vendor can reach the
  first and all of them are under the second, so every vendor read Medium and
  At-Risk Vendors read 0 beside a vendor scoring 37. The metric roadmap flags
  that rule as broken ("one fires on both Util > 85% and Util <= 85%") and asks
  for one verdict rather than three, which is what `riskStatus` is now.
- The Risk Status card is off the vendor page. It printed that band a second
  time, in 54px, at the top of every column. The reading lives on the At-Risk
  Vendors tile, which carries the list behind a View button the way Upcoming
  Contract Renewals and Projects at Risk do. `riskStatus` stays in the registry
  and can go back on any lens with one line of config.
- The designation strip is per lens, `designationStrip` in `config/lenses.json`.
  It is off on Vendor Performance, where it moved three ratios and decided
  nothing, and on wherever it rescales a column of money.
- A project's status is derived, never configured. Each project has a `share` of
  its vendor's task volume and a `factor` that tilts its on-time rate; its
  assigned, on-time and late counts and its at-risk flag all follow. Two config
  strings used to carry the status and the reason, so a project could be flagged
  against numbers that said otherwise, in units the model does not have.
- Metric chips commit on click rather than behind Apply, at the product owner's
  request. The multiselects do use Apply, as the product does.
- The descriptive paragraph under each metric title is removed, per the Sep 2026
  metric tooltip spec. The live build still shows it.
- The KPI hero strip recomputes with every filter. The shipped build shows the
  same four frozen values on every period and on two different pages.
- Capacity Utilization no longer reproduces the live build's Yearly 2026
  figures. Those ran above 100% and their hour totals did not divide to the
  percentages printed beside them. The calibration here is set so utilization
  lands at 68 / 58 / 42, 60% portfolio-wide, and every identity closes. The
  whole model is ten times the size it was in 1.3: 950 contracted FTE, not 95,
  because a governance conversation about $40M does not happen over a $4M
  portfolio.
- Idle Capacity is 100 minus Capacity Utilization, the PEM Metrics workbook
  definition. Leakage Value is non-productive hours over *contracted* hours, not over
  logged hours, at the product owner's instruction: the reference point is what
  you paid for.
- Overtime bills at the contracted rate. There is no premium, confirmed with the
  product owner.
- Excess FTEs divides Hours Shortfall by 7.5 hours per working day, so it
  reads the same whether you look at a week or a year.
- Delta chips carry a `tone` separate from their arrow direction. A rising cost
  points up and reads red. Set `goodDown` on `delta()` and `moneyDelta()` for
  any metric where less is better.
- Threshold pills go on exactly two metrics, Vendor Score and Leakage Breakdown,
  which is what the live build badges. Audited 23 Sep 2026 and pinned by a test.
  Overtime Integrity states its number and leaves the reading to the viewer.
- The drilldown chevron is on Financial Impact, as in the live build, and on
  Hours Shortfall and Excess FTEs, because that slide-out is where those two
  numbers live. `drill: 'costLoss'` in the registry is the hook.
- Headcount reads by designation, not by role: Associate, Senior Associate,
  Lead, Manager, each with a cost factor. The designation strip on a vendor card
  rescales that column by the designation's share of the roster; the aside rows
  sum to the vendor's headcount.
- Leakage Value sits above Financial Impact across the portfolio, $40.34M
  against $34.24M. Leakage Value counts every non-productive hour inside
  logged time; Financial Impact counts only the hours never delivered against
  contracted capacity. A build where the first came in under the second was
  telling the reader that waste is smaller than absence. `test:engine` pins the ordering. One
  vendor can invert it and InfoSystems does: at 42% capacity utilization most of its
  loss is hours that never arrived, not hours wasted once logged.
- On-Time Delivery, not Delivery Predictability. Nothing is predicted: it is
  tasks delivered on time against tasks assigned. "Predictability" is a lens
  name in PEM Metrics.xlsx and the Persona Lens Spec, and the metrics under it
  are variability measures. On-Time Delivery is the name that sheet already uses
  for this number. It is also Output Rate times SLA Compliance, which is a
  hierarchy rather than a redundancy: the headline first, its two parts under
  it. That relationship is not written on screen, at the product owner's
  instruction.
- The contract exhaustion date is derived from the burn and the term, never
  configured. A configured date let Adventure Inc read 91% spent against 93% of
  its term elapsed while claiming the money ran out a month early.
- "Financial Impact", "Leakage Value", "Verified Cost" and "Headcount by
  Designation" are the current names. The metric ids behind them are still
  `costAtRisk`, `leakageValue`, `billableCost` and `headcountByRole`, so a
  rename stays a `config/copy.json` edit and no test or lens config has to move.
- Over and Under Utilized Employee are shares of seats, not of hours. A seat's
  utilization is a lognormal draw around its vendor's mean, scattered by
  `personality.utilizationSpread`. It was uniform until 1.5, which put 79% of a
  roster outside the healthy band and capped a seat at 2.15 times the mean, so
  the vendor with the lowest utilization could not produce a single overworked
  person. A test now asserts every vendor can.
- Most people being under-utilized is the finding, not a bug. A portfolio
  running at 56% effective utilization against a 70% floor has three quarters of
  its roster below that floor by arithmetic. That is the pitch: you are paying
  for 950 people and getting 570.
- Utilization at High-rate Locations reads only the sites billing above
  `highRateUsdPerHour` in `config/vendors.json`. Weighted across every site it
  is effective utilization with a different name, which is what it was until
  1.5: the card printed 60.01% beside a 60.00% on the same page.
- Unused Capacity and Idle Time Cost are different things and the tooltips say
  so. Unused Capacity is contracted capacity that never became work, 100 minus
  capacity utilization. Idle Time Cost is idle inside the hours that were
  logged, about 14% of logged against a 32% Unused Capacity for Adventure Inc.

## One name per definition

The product owner's rule from the 25 Sep review: a customer has to read this
without a ProHance person beside them, so **one quantity carries one name on
every screen**. Before 1.9 the same function was labelled three ways.

| The quantity | The one name |
| --- | --- |
| `(contracted - productive) x rate` | **Financial Impact** |
| `(logged - productive) x rate` | **Leakage Value** |
| `productive x rate` | **Verified Cost** |
| `contracted - productive`, in hours | **Hours Shortfall** |
| the same, in people | **Excess FTEs** |
| a person on contract | an **Employee**; a count of them is **Headcount** |

`Cost of the gap` is the one deliberate exception, kept at the product owner's
instruction: inside the Partner Efficiency bar it is a component of Contract
Value, and the position carries the meaning.

Two traps this closed. "Gap" and "Capacity gap" used to be different numbers on
different cards, one measured from logged hours and one from contracted. And
"Leakage Breakdown" carried a tooltip describing the *other* family entirely.

Before adding a label, search `config/copy.json` for its tooltip sentence. If
that sentence is already there under another id, you are about to add a fourth
name to something that has three.
Person nouns are **Employee** and **Headcount** only, at the product owner's
decision on 26 Sep. Resources is gone from every label. FTE stays, but only for
a derived equivalent: Excess FTEs is not a count of named people. "People" may
appear inside a tooltip as plain English, which explains rather than competes.
Neither "users" nor "contractors" has ever appeared in this build; that was
production, not the prototype.


## Open: overtime tracked and claimed

Both are wrong today and the product owner has parked the fix.

- **Overtime tracked** is a configured total (`ot` in `vendors.json`), not
  derived from anything. Its tooltip claims "productive time above 7.5 hours a
  person a day", which is the intended definition, not the calculation.
- **Overtime claimed** is tracked times a per-vendor multiplier
  (`claimedOtMultiplier`: 0.75, 1.5, 2.0). The vendor's logged hours are not
  used, and a multiplier under 1 makes a vendor under-bill its own overtime.

The agreed direction, 28 Sep: **tracked** becomes productive hours above the
daily threshold, **claimed** becomes logged hours above it. Because logged is
always at least productive, claimed is then always at least tracked, so the
invariant falls out of the data instead of being set by config. The gap between
them is the non-productive part of the overtime, which is the number the
customer is being billed for and did not get.

Cost: tracked needs a per-person daily hours distribution, which the engine does
not have. The seat model draws utilization per seat, not hours per seat per day.
Claimed from logged is a formula swap; tracked is new engine work.

Until then, **claimed must never fall below tracked**, which is the product
owner's rule of 28 Sep. `claimedOtMultiplier` is above 1 for every vendor and
`test:engine` asserts the relationship, so setting one below 1 fails the build
rather than shipping a vendor that under-bills its own overtime.

## Units, and the persona that reads them

Every number on screen names what it counts, in the unit the persona acts in.

- **Delivery counts tasks.** Tasks assigned, tasks completed, tasks delivered on
  time, tasks late. A project's risk line reads "5,865 of 16,368 tasks late or
  undelivered", not "12 points under contract", which named a unit the model
  does not have and that no one can act on.
- **Finance counts money and hours**, at the rate card, abbreviated the same way
  everywhere: `$132.48M`, `491.84K hrs`.
- **Capacity counts people**, whole, never a third of one.
- **A score has no unit.** Vendor Score is a weighted index, so its delta is a
  plain signed number. It used to say "pts".
- **A percentage is a percentage.** Nothing on screen is expressed in "points".

Anything derived is derived from the same counts, so a status and the numbers
beside it cannot disagree. A project is at risk because its own on-time
percentage is under `projectOnTimeFloor`, not because a string in the config
says so.

## Every vendor has a shape

A prototype where every percentage sits on its annual value reads as a mockup.
Until 1.5 that is what this was: one volume draw per day and a 4% wander per
key, which pins every ratio by construction. Capacity Utilization moved 1.39
points across eight months, the overtime rate moved 0.12, and every trend chart
drew a flat line.

`personality` in `config/vendors.json` fixes it. `shape` is the arc a vendor
travels across the year, `improving`, `sagging` or `sliding`, and `swing` is how
far each key travels peak to trough, signed so a positive number moves with the
vendor's fortunes. Ratios move because the keys in a ratio have different
swings: productive swings 0.20 against expected's 0.02, so capacity utilization
climbs. `wobble` adds a weekly jitter so a trend line reads as measured rather
than drawn with a ruler.

Two things make it safe. **Calibration is untouched**: each key is still scaled
to its configured year total, so every pinned figure reads the same whatever
path it took. And **keys that are subsets of one another share a noise draw**,
so their daily ratio carries no noise and moves only along the arc, which is the
only reason a vendor already at a 94.7% output rate can swing at all without
posting a day over 100. Both are asserted in `tests/engine.test.ts`.

Adding a swing is not free: a ratio has only as much headroom as `100 - its
annual value`, and the arc uses half the swing differential either side. If the
daily walk goes red, that is what it is telling you.

## Three colour families, and what each one means

Blue is anything measured. Every trend series on every page is blue, two tints:
`chart.productive` for the value and `chart.logged` for the series behind it.

Amber is loss, and only the marks that ARE the loss: the segments inside a
stacked bar, the gap in Partner Efficiency, the high-rate locations, a contract
burning past its term. Three tones, `lossStrong` / `lossMid` / `lossLight`, so a
breakdown of one quantity reads as one family. A trend chart of a loss ratio is
still blue, because a rate over time is a measurement.

Grey is the remainder: the part of a bar that is not the story.

The three `vendorSeries` hues exist for exactly one job, charts where vendors
compete side by side, which today is Consolidation Levers and Vendor Dependency.
Because they are used nowhere else, a teal anywhere on a page means CTS
Consulting. Do not borrow them for a stacked bar.

Status colours are unchanged and separate: green, amber and red on the two
badged metrics, the Risk Status level, the delta chips and the hero sparklines.
A money headline is green only where it is money you got something for;
Financial Impact prints in ink, because green on a loss reads as good news.

The build carried eight unrelated data hues before 1.6, with teal meaning
"non-core activities" on one card and "CTS Consulting" on the next.

## Say it once

Every sentence on a card has to earn its place against the chart beside it.
Cut in 1.6: "budget runs out early" and its two sub-lines under Contract Burn,
the Vendor Dependency sentence naming the consequence and the one proposing a
remedy, both Consolidation Levers insight lines, and the hours sentence under
Capacity Utilization.

Three tests for a line of copy:

- **Does the picture already say it?** The burn bar with a term mark says the
  budget runs out early. The sentence did not survive.
- **Is it a recommendation?** "Spreading comparable work across the other 2
  would cut that exposure" is a decision, and the product owner's rule is that
  the prototype does not make them.
- **Does it appear elsewhere on the same page?** The two hour figures under
  Capacity Utilization are in Partner Efficiency directly above it.

Tooltips follow `docs/` and the Sep 2026 tooltip spec: ratios read
`<what was delivered> against <what it was measured against>`, money reads
`<what>, valued at your rate card`, counts name what is counted. No formula, no
threshold value, no "not the same as", no tap instruction, no second sentence.

## The design system is fixed

There is a product in production. The prototype may not look different from it,
so no new component, no new spacing scale, no new type ramp, no colour that is
not already in `config/theme.json`. Content from a mockup is fair game; its
layout is not. Anything that does need a layout decision gets asked, not
invented. This is the product owner's ground rule and it outranks any mockup,
including the Figma files: those are old prototypes built without the design
system, and only their metric structure is a reference.

## Hero tiles sit on one baseline

Every number in a hero strip has to start at the same y, and a number sits
directly below its label, so every label box has to be as tall as the tallest
label in that strip. A fixed two-line reserve did that until a label wrapped to
three lines on an iPad and dropped its number 18px below the rest.

CSS cannot size one tile's box from another tile's content. Subgrid would, but a
tile carries `container-type: inline-size` for its own narrow-width reflow, and a
size container can never be a subgrid: the used value falls back to `none`, which
was verified in Chromium rather than assumed. So `useLabelReserve` measures
instead. It reads the tallest `.kl` span in the strip and writes
`--kpi-label-h`, which is the label's `min-height`. The span is what gets
measured, not the box: the span is `display:block` and wraps to its natural
height whatever reserve sits on the box around it, which keeps the read out of
the loop the ResizeObserver is watching. `VendorDetail` does the same with
`--dkpi-title-h`.

The other half is the number's own box. `.kpi-val` has the sparkline's height,
44px, so a tile with a sparkline beside its number lines up with a tile without
one. A Playwright test asserts one baseline per strip on all four lenses at iPad
width, and two baselines on the vendor page, which is two rows of four.

## A list of numbers is not a visualisation

Partner Efficiency and the Leakage Breakdown were 575px and 572px, the two tallest
cards on a page already four screens long, and both were a column of label-value
rows. They are one stacked bar each now, `StackBar` in `MetricSection.tsx`,
which is the progress-bar idiom the location rows already use, split into named
parts with the numbers in a legend beside it. SLA Risk Summary was six stacked
project blocks at 437px; it is three rows, one per vendor, worst first, with
each project a chip and its reason one tap away.

The rule these follow: a card should answer its question in one look, and carry
the numbers for anyone who wants to check. If a card is a list, ask what shape
the list is describing and draw that instead.

## Touch

The prototype is demoed on an iPad Air in landscape, so touch is a first-class
input, not a fallback.

A tap on iOS fires a whole sequence: `pointerdown`, `touchstart`, `mouseover`,
`mousedown`, `mouseup`, `click`. A control wired naively to both hover and click
opens on the synthesised `mouseover` and closes again on the `click`, so it never
appears. `preventDefault` is not a reliable cure; whether the click still arrives
varies by browser and by automation driver. So `useTapToggle` in
`src/components/usePointer.ts` deduplicates instead: the first touch toggles and
every mouse event for the next 700ms is ignored as an echo. Anything that opens
on click uses it.

Charts use pointer events, so one code path serves a mouse, a trackpad and a
finger. A touch tooltip latches rather than vanishing when the finger lifts,
because on a tablet the finger is what was covering the number you came to read;
the next tap elsewhere clears it.

Every tap target clears 32px. The info icon keeps its 14px glyph and gets its
size from an invisible `::after` pad, so nothing on the page moves.

## Style

TypeScript, strict. Relative imports carry their extension (`./x.ts`,
`./X.tsx`) so the engine runs unchanged in Node for the calibration test.
Components do presentation; if a component is doing arithmetic, the arithmetic
belongs in `src/engine/formulas.ts` or a metric's `compute`.
