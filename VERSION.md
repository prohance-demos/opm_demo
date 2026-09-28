# Version history

Newest first. One line per change. Bump the minor number for new capability,
the patch number for fixes only.

## 1.9.1, 28 Sep 2026

- **Leakage Value is back**, at the product owner's decision. The formula is
  untouched: still `(logged - productive) x rate`, $40.34M, still distinct from
  Financial Impact's `(contracted - productive) x rate` at $34.24M. Only the
  labels moved, so no test expectation on a number changed. The family reads
  Leakage Value, Leakage Breakdown, Unproductive FTEs and Leakage hours, which keeps
  one name per definition and keeps "Gap" from meaning two things again.
- **Overtime claimed is now always above overtime tracked.** Adventure Inc's
  `claimedOtMultiplier` was 0.75, so the demo showed a vendor under-billing its
  own overtime, which is not the story this dashboard is for. It is 1.35 now, so
  the three vendors over-claim by 35%, 50% and 100%, ranked the same way their
  scores are. A new engine assertion pins the relationship for every vendor
  rather than leaving it to a config value anyone can set below 1.
- The deeper overtime fix is recorded as a known defect in `CLAUDE.md` and is
  still deferred: tracked should be derived from productive hours above the
  daily threshold and claimed from logged hours above it, at which point the
  relationship holds by construction and needs no multiplier.

## 1.9.0, 26 Sep 2026

Richard's review of 25 Sep, and one defect it surfaced.

- **One name per definition, everywhere.** The review found Financial Impact and
  Cost Loss printing the same number under two labels. The code showed worse:
  `financialImpact.hero` and `costAtRisk.hero` are identical calls, and Cost of
  the Gap is that same figure a third time. Five collision groups resolved.
  Financial Impact for contracted capacity not delivered, Leakage Value for
  logged hours that were not productive, Verified Cost for the productive work
  delivered, Hours not delivered and Excess FTEs for the hours and the people.
  Person nouns are Employee and Headcount only, so the Resources pair on Partner
  Efficiency reads Employees. See "One name per definition" in `CLAUDE.md`. Cost
  of the gap, Total Headcount and Headcount by Designation stay, at the product
  owner's instruction.
- **"Gap" and "Capacity gap" were different numbers** on different cards, one
  measured from logged hours and one from contracted. So were Resources and
  Total Headcount, FTE equivalent and Excess FTEs, Actual Cost and Billable
  Cost. And Leakage Breakdown carried a tooltip describing the other family.
- **The vendors are renamed.** Adventure Inc (strategic, 300), CTS Consulting
  (tactical, 580) and InfoSystems (tactical, 70), with three new original logo
  marks. Every seed is unchanged, so no figure on any screen moved: the
  calibration test passes with the same expectations it had in 1.8.
- **Contract Value at Risk is off the Delivery hero**, replaced by Tactical /
  Strategic Vendors with a View list. It printed $37.59M beside Financial
  Impact's $34.24M and nothing on screen said what separated them.
- **Every lens opens on Yearly.** Cost Efficiency and Capacity were Weekly, so
  Cost opened at $415K of leakage rather than $40.34M.
- **Cost of the gap carries its FTE count**, pulled from the same formula as the
  Excess FTEs pair above it rather than typed, so the money and the people
  cannot disagree.
- **Fixed: grouped columns floated off their labels.** A category was divided by
  the number of series rather than by the series that actually have a value in
  it. On Consolidation Levers compared by Project, where each project belongs to
  one vendor, two of every three slots were reserved for bars that draw nothing
  and the one real bar sat a third of a category left or right of its own label.
  Six of the eight locations had it too. Designations and skills are unaffected,
  because every vendor has all of them. `groupedColumn` in `primitives.ts`,
  pinned by six new assertions in `test:charts`.

## 1.8.0, 25 Sep 2026

Removed
- **The Risk Status card.** It printed the Vendor Score's band a second time, in
  54px, at the top of every column, and a word that large was the loudest thing
  on the page for the least new information. The reading moved to where the
  count already was.

Added
- **At-Risk Vendors carries the list.** The tile has a View button, the way
  Upcoming Contract Renewals and Projects at Risk do, and it names who is at
  risk with the score and SLA that put them there: "Ploceus, score 37.2, SLA
  29.97%". A count on its own said nothing.
- **A GitHub Actions workflow** that builds the prototype and publishes the
  single-file version as a GitHub Pages site on every push to `main`. It runs
  the engine and chart guards first, so a broken number never reaches the URL.
  Vite's `base` is relative now, so the build runs from any path.

## 1.7.0, 25 Sep 2026

The vendor page audit, and the units made honest. Every number on screen now
names what it counts.

Fixed
- **At-Risk Vendors read 0 beside a vendor scoring 37.** The risk rule fired on
  two absolute cut-offs, utilization over 85 and SLA under 90. No vendor in a
  portfolio running at 60% utilization can cross the first, and all three are
  under the second, so every vendor read Medium and nothing was ever at risk.
  The metric roadmap already flags that rule as broken and asks for one verdict
  rather than three. Risk Status now reads the Vendor Score's own bands, so the
  pill and the score can never disagree: PH Engineering 71.6 Low, PH Operations
  65.2 Medium, Ploceus 37.2 High, and At-Risk Vendors is 1. No data was moved to
  get there.
- **"12 points under contract" had no unit.** Project status and the line
  explaining it were two strings in the config, written in units the model does
  not have, and a project could be flagged against numbers that said otherwise.
  Every project now carries a share of its vendor's task volume, and its
  assigned, on-time and late counts, its on-time percentage and whether it is at
  risk are all derived from that. The chip reads "5,865 of 16,368 tasks late or
  undelivered, 64.2% on time". Tasks are what a delivery head acts on.
- The Vendor Score delta said "+4.1 pts". A weighted index is not a percentage
  and "pts" was the one unit on screen a reader had to guess at. It is a plain
  signed number now.
- Cost Loss printed in green, which is the colour this build uses for money you
  got something for. A loss prints in ink.
- Risk Status printed Low, Medium and High all in orange. Each level now takes
  the colour of the band it was read from, matching the Vendor Score badge above
  it.

Changed
- **The designation strip is off the Vendor Performance page.** It moved three
  ratios there and decided nothing. It stays on Cost Efficiency and Delivery,
  where it rescales a column of money. `designationStrip` per lens in
  `config/lenses.json`.
- **Cost Loss is a vendor card.** PEM Metrics.xlsx lists it as a Ven -
  Performance metric and the page carried it only in the hero: six cards of
  ratios and a verdict, and nowhere the money a vendor manager is arguing about.
- **Vendor Dependency Risk is a ring, not a bar.** A horizontal share bar reads
  as a progress bar; the point of the metric is that the three shares are one
  whole. The ring sits beside the number, the way the Productive vs
  Non-Productive card already arranges a donut.
- **Contract Burn is two bars on one scale**, budget spent above contract term.
  A longer budget bar is money going out faster than the calendar, which needs
  no mark, no key and no sentence. The "term elapsed 93%" line is gone.
- Partner Efficiency's Resources and Excess FTEs carry tooltips.
- The contract exhaustion date is derived from the burn and the term, so it can
  no longer contradict the bars beside it.

## 1.6.0, 25 Sep 2026

The review pass on 1.5. A metric renamed to what it measures, the palette cut to
three families, every redundant sentence removed, and the axis bug reproduced
and fixed for good.

Fixed
- **The axis ran out of the card, and this time it reproduced.** With the rail
  expanded and Compare by set to Project, a 27-character project name tilts, and
  a tilted label reaches down the page by its own length times sin(38 degrees),
  about 95px against an axis margin of 40. It hung 45px below the card.
  `labelFit` now tilts only what fits the margin, so "Jan 2026" still tilts and
  a project name stays flat and is cut to its slot with the full text on hover.
  `.chart` is clipped on both axes, because nothing needs to paint outside it
  any more. A test walks every lens, every dimension and two widths and asserts
  no label leaves a card.
- **Contract Burn contradicted itself.** PH Engineering read 91% spent against
  93% of its term elapsed, which is under the run rate, while a configured date
  said the money ran out a month early. The exhaustion date is now derived from
  the burn, so the two cannot disagree, and the configured date is gone.

Changed
- **Delivery Predictability is On-Time Delivery.** Nothing was being predicted.
  "Predictability" is a lens name in our own sources, never a metric: the
  metrics under it are variability measures. On-Time Delivery is the name PEM
  Metrics.xlsx already uses for this number. The card now says what it is
  counting: tasks assigned, tasks delivered on time. Output Rate uses the same
  two words.
- **The palette is three families.** Blue, two tints, for anything measured, and
  every trend series on every page uses it. Amber, three tones, only on the
  marks that are the loss itself: the segments inside a stacked bar, the gap,
  the high-rate locations, a contract burning past its term. Grey for the
  remainder. The three vendor hues appear only where vendors compete on one
  chart, so a teal anywhere means PH Operations. Eight unrelated hues before.
- **Contract Burn is one fill with a mark.** The mark is the share of the term
  elapsed, so a fill past it is money leaving faster than the calendar. That was
  a gradient plus a line of red text plus a sub-line under a date.
- **Every tooltip re-cut against the Sep 2026 tooltip spec.** No "not the same
  as" clauses, no formulas, no threshold values, no tap instructions, no
  editorial. Ratios read as what was delivered against what it was measured
  against; money reads as what, valued at your rate card.

Removed
- "budget runs out early", "budget runs out before the contract does", "inside
  the contract term" on Contract Burn. The bar carries it.
- The Vendor Dependency sentence naming the consequence and the one proposing a
  remedy. The headline and the bar carry it, and the second was a
  recommendation.
- The Consolidation Levers insight line, both versions. It restated the tallest
  and shortest bar.
- "3.34K productive hours of 4.62K expected productive hours" under Capacity
  Utilization, now "3.34K of 4.62K hrs". The same two figures sit in Partner
  Efficiency directly above on that page.

## 1.5.0, 25 Sep 2026

The review pass on 1.4. Four cards and a band redrawn, and the dataset given a
shape so a vendor reads like a vendor rather than a flat line. Design system
untouched: every piece here is a component the build already had.

Fixed
- **Every ratio was flat.** Capacity Utilization travelled 1.39 points across
  eight months for PH Engineering, 1.02 for PH Operations, 0.82 for Ploceus, and
  the overtime rate moved 0.12. The generator drew one volume per day and let
  each key wander 4% around it, which pins every percentage to its annual value
  by construction. Each vendor now has a **personality**: an arc across the year
  with a per-key swing, so ratios move. PH Engineering climbs (CU 64 to 72, SLA
  73 to 81, overtime falling), PH Operations recovers to a June peak and starts
  rolling back, Ploceus slides (CU 46 to 38, SLA 35 to 25) while its overtime
  climbs from 12.8 to 17.1. Penalty Exposure and every trend chart show it.
  The calibrated year totals are untouched: every figure pinned in 1.4 still
  reads the same.
- **Utilization of High-rate Resources was Effective Utilization.** The site
  weights averaged to 1.0001, so the card printed 60.01% beside a 60.00% on the
  same page. Sites now carry their own hourly rate, and the metric reads only
  the locations above $65 an hour. It is now **Utilization at High-rate
  Locations**: 56.98% against a 60% vendor average for PH Engineering, and
  41.8% against 55% for PH Operations, whose one expensive site is its worst.
- **The locations were three Indian cities inside six points of each other.**
  Now international, with two vendors sharing hubs and one onshore niche:
  PH Engineering runs Bengaluru, Kraków, Manila and Belfast; PH Operations
  Manila, Bengaluru, Cebu and Guadalajara; Ploceus is Zurich and London, which
  is what its $90 rate and its numbers are made of. The spread is 20 points
  inside a vendor, which is what makes a consolidation lever a lever.
- **The seat model was uniform**, a draw from a tenth to 2.15 times the mean. It
  put 79% of PH Engineering's roster outside the healthy band, and it capped a
  seat at 2.15 times the mean, so Ploceus at 45% could not produce one person
  over 100% and the worst vendor in the book reported that nobody was
  overworked. It is lognormal now, scattered per vendor, and every vendor can
  show an overworked person. A test pins that.
- **Two different things were called idle** on one page. Idle Capacity is now
  **Unused Capacity**, contracted capacity that never became work; Idle Time
  Cost stays what it was, idle inside the hours that were logged. Each tooltip
  now says what it is not.
- **Consolidation Levers ran its axis past the card.** Not reproducible at any
  width from 1024 to 2560, and it corrected itself on a re-render, which points
  at a stale measured width surviving a dropped ResizeObserver notification. Two
  changes make it structural: `.chart` clips horizontally, so nothing can paint
  outside the card whatever width the chart thinks it has, and `useMeasure`
  re-reads after every render, so any change on the page corrects a stale value.
- Consolidation Levers named a vendor as the worst performer at a location it
  does not staff. Only vendors present at a slice are compared now, and shared
  locations sort first.

Changed
- **Partner Efficiency**: seven label-value rows became one bar. Contract value
  splits into what the work you got cost and what the work you did not get cost,
  with the hours beside each. 575px to 469px.
- **Leakage Breakdown**: five rows became one bar across contracted capacity,
  idle, non-core and non-billable against the productive remainder, with the
  totals folded into the legend. 572px to 475px.
- **SLA Risk Summary**: six stacked project blocks became one row per vendor,
  worst first, with each project as a chip and the reason one tap away. 437px to
  180px.
- Cost Efficiency is 2918px from 3121, Delivery 3146px from 3404.

## 1.4.0, 25 Sep 2026

The Cost and Delivery pass from the 23 Sep review. A tenfold dataset, a
Delivery Performance lens, designation slicing on every vendor card, and the
metric names Richard called out replaced. Layout and design system untouched:
this build uses the same components, spacing and type as production.

Added
- **Delivery Performance**, a second lens. Hero: Financial Impact, FTE
  equivalent, SLA Compliance, Projects at Risk, Contract Value at Risk. Cards:
  Delivery Predictability, Output Rate, Contract Burn, Penalty Exposure. Bands:
  Vendor Dependency Risk, Consolidation Levers, SLA Risk Summary.
- **Designation strip** on every vendor card: All / Associate / Senior
  Associate / Lead / Manager. Picking one rescales that column by the
  designation's share of the roster. In-card buttons, not a page dropdown, at
  the product owner's instruction.
- **Dimension system.** Skill Set, Designation, Project and Location are one
  generic slice, so Consolidation Levers compares on any of the four from a
  single Compare by control rather than four hand-written charts.
- **Contract model** per vendor: value, term, burn rate and the date the budget
  runs out. Contract Burn warns when the money ends before the term does.
- **Projects**, six of them along the lines Richard named: Digital Banking
  Platform, Cloud Migration Wave 2, ERP Modernization, Claims Processing
  Automation, Data Platform Consolidation, Customer Portal Refresh. Three are
  at risk.
- **Penalty exposure and SLA breaches** per vendor, $450K and 22 across the
  portfolio.
- **Vendor tier tag** on the card header, strategic or tactical. A tag, not a
  hero tile.
- **Leakage Breakdown** replaces the old summary: idle measured, the remainder
  split into non-core and non-billable, each row carrying its money line.
- **Overtime tracked against claimed.** Each vendor has a claim multiplier, so
  the card reads tracked hours beside claimed hours and the gap between them.
  No threshold pill: it states the numbers and leaves the reading to the viewer.

Changed
- **The dataset is ten times the old one.** 950 contracted FTE across three
  vendors against 95 before. Capacity Utilization lands at 60% portfolio-wide
  (68 / 58 / 42 by vendor), Leakage Value at $40.34M, Cost Loss at $34.24M,
  hours not delivered at 550K, FTE equivalent at 380. Leakage Value now sits
  above Cost Loss, as it must: leakage counts every non-productive hour, cost
  loss only the hours never delivered. `test:engine` pins that ordering.
- **Metric names.** Billable Portfolio Cost is Actual Cost Incurred; the names
  Richard called out are gone, pinned by a test.
- **Roles became designations.** The old role mapping is replaced by four
  designations with cost factors, which is what the strip slices on.
- FTE reads as a whole number everywhere: the tile, its delta and the Cost Loss
  drilldown. A third of a person is not something anyone acts on.

Fixed
- **Hero numbers sat on different baselines.** A label that wrapped to three
  lines on an iPad pushed its number 18px below the rest of the strip, and a
  tile with a sparkline sat 2px below one without. The strip now measures its
  tallest label and reserves that height on every tile, and the number's box is
  the sparkline's own height. Holds on all four lenses, at 1180 and at 1720,
  and on the vendor page's two rows of four. Pinned by a test.
- A delta no longer breaks its figure across two lines on a narrow tile; the
  period phrase drops to its own line instead.
- The designation strip wraps rather than clipping "Manager" mid-word.
- Vendor Dependency Risk carries no threshold pill. Only Vendor Score and
  Leakage Summary do, which is what production badges.
- Contract Burn states "Ahead of term" as plain warning text, not a pill.

Not built, tracked open
- Renewal Notifications and Actions (C6). The product owner is handling this
  with Richard; no recommendation engine in the prototype.
- Two points to raise with Richard: the Aubergine file's numbers are an order of
  magnitude below ours, and its four lenses are not our four.

## 1.3.0, 23 Sep 2026

Second review pass on the Cost Efficiency build, plus the Cost Loss drilldown.
Audited against the live build at enhance.prohance.io the same day.

Added
- The Cost Loss drilldown, a replica of the shipped slide-out: the headline with
  its own eleven-week trend, Expected productive hours / Hours not delivered /
  FTE equivalent, its own period tabs and date picker independent of the page,
  the Cost Loss Trend line, the Vertical wise Breakup donut and the Vendor wise
  Breakup rows, each opening that vendor. It scopes to whatever the page's
  vendor filter is showing. Production puts the chevron on exactly one tile,
  Cost Loss; here it is on Cost Loss and, on Cost Efficiency, on Hours not
  delivered and FTE equivalent, because those two numbers are what the panel is
  about.
- The rail's bottom block: Instances, Company Settings, Help, Sign out and the
  signed-in user, collapsed and expanded. The CSS had been there since v1.0; the
  markup was never ported, so the whole block was missing.

Fixed
- Charts were scaled up. Their width came from `theme.sheetMinWidth`, which is a
  floor, so on any screen wider than 1100 the SVG viewBox was narrower than the
  box it drew into and the browser magnified the whole drawing: an axis label
  set at 10px came out at 16 and the labels ran into each other. Every chart now
  measures its own container and renders one to one.
- Axis labels tilt on geometry rather than on a guess about label length. The
  product prints twelve week labels flat because its chart is 761px wide; three
  vendor columns on one sheet are not, so they tilt, and thin if even tilted
  they would collide.
- Grouped bars were 90px slabs. They now honour the same 40px cap the overlay
  columns use, with the group centred on its category. The product renders 36px
  bars on a 761px chart.
- Trend charts fell off a cliff at the right edge. A part week or part month
  plotted beside full ones reads as a collapse rather than as a period still
  running, so an unfinished trailing bucket is dropped. Daily buckets are never
  partial, so the Weekly view still shows today.
- Tooltips at the foot of the page were cut in half. The bubble is now rendered
  in a portal in viewport coordinates, so no ancestor with `overflow: hidden`
  can clip it, and it flips below the icon near the top of the window.
- Overtime Integrity no longer carries a Healthy / Watch / Critical pill. The
  live build badges exactly two metrics, Vendor Score and Leakage Summary; a
  test now pins that list.
- Leakage and Overtime cards break in the same place on every vendor column:
  badge and delta travel as one unit rather than wrapping wherever the words end.

Changed
- Axis label size 10 to 11, closer to the product's 12 without crowding a
  narrower column.
- The Cost Loss tile's chevron target is 34px, like every other tap target.

## 1.2.0, 23 Sep 2026

Cost Efficiency rebuilt from Richard's review notes. Cost Efficiency only:
Vendor Performance and Capacity & Utilization keep their layout, though the
dataset change below moves their numbers.

Added
- Five hero tiles, one row at any width: Leakage Value, Capacity Utilization,
  Hours not delivered, FTE equivalent, Upcoming Contract Renewals. Each tile is
  its own CSS container, so a narrow tile drops its sparkline under the number
  rather than the strip wrapping to a second row.
- Upcoming Contract Renewals opens the list of vendors and due dates behind the
  count, on click or tap.
- Overtime Integrity, a new vendor card: percentage, badge, period delta, then
  Total OT Hours, Employees Over Threshold, OT Cost and OT Cost at Risk over a
  column chart, mirroring the Idle Time Cost card. No overtime premium: the
  contracted rate card applies to every hour.
- Productivity Comparison on Similar Work, a full-width band below the vendor
  grid comparing vendors on four skills. Driven by the page filter bar, with a
  "Compare by" control that offers Skill Set. `portfolioSections` in
  config/lenses.json is the new hook for a metric that only means something
  across vendors.
- Leakage Summary keeps its shape and gains an Excess FTEs row.
- Contract Value, Cost Loss, Leakage Value, Hours not delivered, FTE equivalent,
  overtime and skill formulas in src/engine/formulas.ts.

Changed
- Dataset recalibrated. Capacity Utilization is 87 / 82 / 58 per vendor and
  82.7% across the portfolio; nothing anywhere prints over 100%. Rate cards are
  now $65 / $58 / $96 and apply to billable, idle and overtime hours alike.
- Contract Value minus Billable Portfolio Cost equals Cost Loss exactly, per
  vendor and across the portfolio. `npm run test:engine` pins it.
- Leakage is non-productive hours over contracted hours, not over logged hours.
  Bands are healthy under 25, watch to 35, critical above.
- Idle Capacity is 100 minus Capacity Utilization, the workbook definition.
- Weekends carry data at 18% of a weekday on Saturday and 6% on Sunday, so no
  window comes back empty. Day noise is now one shared volume draw per day plus
  a few percent per series, which is what keeps a single day from printing
  utilization over 100%.
- Ploceus has deliveries, so nothing on its card reads "No data available". It
  is still the critical vendor, on SLA rather than on missing data.
- Second vertical is Services and holds Ploceus. The vertical filter will not
  let you clear the last one, so the page can never empty.
- The date pickers refuse the future: disabled years, quarters, months, days and
  paging arrows past 15 Sep 2026.
- SLA Compliance removed from Cost Efficiency entirely. It stays on Vendor
  Performance.
- The "View as" role switcher is gone. config/roles.json keeps the roles and
  `showSwitcher: false`; set it true to put the picker back.
- Delta chips carry a tone separate from their arrow. A rising cost points up
  and reads red, which it did not before: every cost metric turned green as it
  got worse.
- Sheet width 1260 to 1100, so an iPad Air in landscape renders at 100% with no
  zoom and no horizontal scroll. The floating view control now hides itself
  when nothing needs scaling.
- Touch: tooltips and the renewals list toggle on tap, chart tooltips latch
  rather than vanishing when the finger lifts, and every tap target clears 32px.
  Pointer events replace mouse events throughout, deduplicated so the mouse
  events a tap synthesises do not undo the tap.
- Sparklines end on the last complete week, not on a two-day stub that read as
  a collapse.
- A date range inside one year prints the year once.

Known consequences
- Yearly 2026 no longer matches the live build's published figures, by design:
  those had utilization above 100% and hour totals that did not divide to the
  percentages beside them.
- Vendor Score, Risk Status, Idle Capacity and the employee split move on the
  other two lenses, because they are functions of the same dataset.

## 1.1.0, 23 Sep 2026

Full chart and functionality audit against the v1.0 HTML prototype and the live
build at enhance.prohance.io, then every finding fixed.

Fixed
- Column charts rendered 7px tall. A `.bar` rule written for the progress bars
  was also matching the SVG rects, and CSS geometry beats the SVG attribute.
- Paired columns were drawn side by side. The product overlays them: a wide bar
  behind, a narrower bar centred in front. Now matched, including top-only
  rounded corners and a width cap so short series do not become slabs.
- Axis maxima were wrong on every chart. The rounding ladder was missing its
  1.5, 3, 4 and 7.5 rungs.
- Vendor Score trend axis now follows the data the way the product does, instead
  of being floored at 50.
- Both Reset and Apply pairs did nothing visible. Multiselect changes now stage
  behind Apply, Reset restores and applies, both close the popover, the page-level
  pair acts on whatever is staged, and all four disable when there is nothing to do.
- Headcount by Role showed the licensed headcount; it is the sum of the mapped
  roles, which is why the product reads 69 for PH Engineering and not 75.
- Over and Under Utilized Employee showed a period comparison the product does not.
- Sparklines were the wrong size and missing their gradient fill.
- The x-axis caption on three metrics said "Day" regardless of period.

Changed
- "Cost at Risk" is now "Cost Loss" and "Idle Cost" is "Idle Time Cost", both
  shipped in the live build and asked for by the metric tooltip spec.
- Second vertical added so the vertical filter is demonstrably real. No vendors
  are assigned to it yet, so selecting it alone gives the empty state.
- Clearing every vertical empties the page; clearing every vendor falls back to all.

Added
- `npm run test:charts`, a browser-free guard on the axis ladder and column geometry.
- Twelve Playwright tests, one per defect above.

## 1.0.0, 16 Sep 2026

First local project. Vite, React and TypeScript, hand-drawn SVG charts, no chart
library.

- Computed dataset: one deterministic daily series per vendor, calibrated so
  Yearly 2026 reproduces the live product's published figures exactly.
- Three lenses, the vendor drilldown, four working date pickers, vertical and
  vendor filters, metric chips.
- Config-driven: vendors, verticals, lenses, roles, copy, thresholds and theme
  are seven JSON files; metrics are a registry of pure functions.
- Role-based views with a "View as" switcher.
- `npm run test:engine` and a Playwright filter sweep.
- `npm run standalone` emits one self-contained HTML file.
