# How the numbers are made

One page on the whole data model, for anyone changing `config/vendors.json`.

## One daily series per vendor

`src/engine/dataset.ts` generates a value for each of eight keys, for every
calendar day, for each vendor:

| Key | Meaning |
| --- | --- |
| `expected` | hours of capacity contracted |
| `productive` | hours of productive work delivered |
| `logged` | hours booked on timesheets |
| `target` | tasks assigned |
| `completed` | tasks finished |
| `onTime` | tasks finished within SLA |
| `idle` | idle hours inside logged time, a subset of non-productive hours |
| `ot` | overtime hours inside logged time |

The generator is a seeded hash, not a random number, so the same date always
produces the same value in the browser, in the test runner and on anyone else's
machine.

Weekends are not empty. `DAY_WEIGHT` gives Saturday 18 percent of a weekday and
Sunday 6 percent, which is enough to read as a weekend on a daily chart and
enough that no window a viewer can select comes back with nothing in it. Days
outside a vendor's `dataFrom` to `dataTo` window still produce nothing, but every
vendor now runs to `today`, and the date pickers refuse the future, so there is
no reachable empty window.

The shape has five ingredients: a growth trend from `growth`, a gentle seasonal
wave, the weekday weight, the vendor's own arc across the year, and per-day
noise from the seed.

## Personality

Without the arc every ratio sits on its annual value. Capacity Utilization moved
1.39 points across eight months, the overtime rate moved 0.12, and every
percentage chart drew a flat line, because one volume draw moved every key
together and each key only wandered 4% around it.

`personality` in `config/vendors.json` gives each vendor a shape:

| Field | What it does |
| --- | --- |
| `shape` | `improving` climbs all year, `sliding` falls all year, `sagging` starts and ends low with a peak in the middle |
| `swing` | per key, how far it travels peak to trough, signed so a positive number moves with the vendor's fortunes |
| `wobble` | a weekly jitter so a trend reads as measured, not drawn with a ruler |
| `utilizationSpread` | how widely that vendor's own seats scatter around its mean |

A ratio moves because its two keys swing differently: Adventure Inc's
`productive` swings 0.20 against `expected`'s 0.02, so its capacity utilization
climbs from 64% in January to 72% in August. InfoSystems swings `onTime` 0.70 on a
`sliding` shape, so its SLA falls from 35% to 25% while its overtime climbs from
12.8% to 17.1%.

Two constraints:

- **Calibration is untouched.** Each key is still scaled to its configured year
  total, so every pinned figure reads exactly the same whatever path it took.
- **Keys inside a family share a noise draw.** Capacity (`expected`), worked
  hours (`logged`, `productive`, `idle`, `ot`) and tasks (`target`, `completed`,
  `onTime`) are three families. A ratio inside one family carries no daily
  noise, only the arc, which is the only reason a vendor already at a 94.7%
  output rate can swing without posting a day over 100. A ratio has only
  `100 - its annual value` of headroom and the arc uses half the swing
  differential either side; `tests/engine.test.ts` walks every day of eleven
  years to prove no subset escapes its set.

The noise matters more than it looks. One **shared volume draw** moves every key
on a day together, and each key then deviates only a few percent around it.
Drawing the keys independently let a single day's Capacity Utilization swing past
100 percent, which is not a number this dashboard should ever narrate.

## Calibration

The raw series has no units. Each key is then scaled by a single factor so that
the vendor's sum across the calibration year equals the figure in
`config/vendors.json`. That is why Yearly 2026 shows exactly the numbers you put
there, and why every other window is a real sum of real days rather than a
separate hand-written table.

Change a calibration number and the whole series rescales proportionally. This is
the only place you need to edit to change what the dashboard says.

The 1.4 portfolio, Yearly 2026:

| | FTE | Rate | CU | EU | SLA | Leakage Value | Cost Loss | Contract |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Adventure Inc | 300 | $74 | 68% | 60% | 77% | $14.56M | $10.28M | $138M |
| CTS Consulting | 580 | $53 | 58% | 55% | 76% | $21.10M | $18.68M | $125M |
| InfoSystems | 70 | $90 | 42% | 45% | 30% | $4.68M | $5.29M | $12.7M |
| Portfolio | 950 | | 60% | 56% | 75% | $40.34M | $34.24M | $275.7M |

The portfolio row's Contract column is the signed value of the three contracts.
The contract value the Cost Efficiency page prints, $85.7M, is a different
number: the capacity contracted for *this window* at the rate card, which is what
Cost Loss subtracts from.

## Aggregation

`src/engine/ranges.ts` turns a filter selection into a window and into chart
buckets:

| Period | Window | Buckets |
| --- | --- | --- |
| Yearly | 1 Jan to 31 Dec | months |
| Quaterly | the calendar quarter | ISO weeks |
| Monthly | the calendar month | ISO weeks |
| Weekly | the chosen day range | days |

Every window is truncated at `today`, so no empty future buckets appear. Deltas
compare against the same shape of window one step back.

## Formulas

`src/engine/formulas.ts`, one function per metric. These were reverse engineered
from the shipped ProHance build and verified against its published figures:

| Metric | Formula |
| --- | --- |
| Capacity Utilization | productive / expected |
| Effective Utilization | productive / logged |
| Gap | 1 minus effective utilization |
| Output Rate | completed / target |
| SLA Compliance | onTime / completed |
| Non productive hours | logged minus productive |
| Leakage | non-productive hours / expected |
| Leakage Value | non-productive hours x rate card |
| Idle Capacity | 100 minus capacity utilization |
| Hours Shortfall | expected minus productive, floored at zero |
| Cost Loss | Hours Shortfall x rate card |
| Contract Value | expected x rate card |
| FTE equivalent | Hours Shortfall / (7.5 x capacity days in the window) |
| Overtime Integrity | ot / logged |
| Claimed overtime | tracked ot x the vendor's `claimedOtMultiplier` |
| OT Cost | ot x rate card, no premium |
| Unproductive OT Cost | ot x (1 minus effective utilization) x rate card |
| Vendor Score | 0.6 x capacity utilization + 0.4 x SLA |
| Actual Cost Incurred | productive x rate card |
| Idle Cost | idle x rate card |
| Cost per productive hour | actual cost / productive hours |
| Slice efficiency | effective utilization x the slice's factor |
| Utilization at High-rate Locations | headcount-weighted utilization of the sites billing above `highRateUsdPerHour` |
| Risk Status | High when utilization is over 85 and SLA under 90 |
| On-Time Delivery | onTime / target: tasks assigned that landed on time. Equals Output Rate times SLA Compliance |
| Contract burn | spent / contract value, against the share of the term elapsed. The exhaustion date is derived from the two, never configured |
| Contract Value at Risk | contract value of every vendor carrying an at-risk project |
| Vendor Dependency | the largest vendor's share of contracted capacity |

Weights and thresholds live in `config/thresholds.json`, not in the code.

Skill Set, Designation, Project and Location are one generic `Dimension`.
`dimensionRows(vendor, dim)` returns each slice with a headcount and a cost
factor, `sliceEfficiency` applies the factor and `sliceShare` gives the slice's
share of the roster, which is how a designation button rescales a whole vendor
column. Adding a fifth dimension is a case in `dimensionRows`, not a new chart.

## The identities that have to hold

Three numbers describe the same money and have to agree:

```
Contract Value  -  Actual Cost Incurred  =  Cost Loss
```

What you contracted for, minus what you got, is what you lost. It holds per
vendor and across the portfolio, exactly, because all three are the same rate
card times a slice of the same hours. `tests/engine.test.ts` asserts it. If you
change a rate or a calibration figure and that test goes red, the page has
started telling three stories about one number.

Idle hours are a subset of non-productive hours, and overtime is a subset of
logged hours. Those two are asserted as well.

A fourth, across the portfolio: **Leakage Value stays above Cost Loss**,
$40.34M against $34.24M. Leakage counts every non-productive hour inside logged
time; cost loss counts only the hours never delivered against contracted
capacity. A portfolio where leakage came in under cost loss would be saying that
waste is smaller than absence. `tests/engine.test.ts` asserts the ordering, not
just the figures. A single vendor may invert it, and InfoSystems does: at 42%
capacity utilization most of its loss is hours that never arrived rather than
hours wasted once logged.

## Locations

Each site carries a `factor` that tilts its utilization around the vendor's own,
a `weight` for its share of the roster, and a `rate` multiplier on the vendor's
bill rate. The weights and rates are set so a vendor's blended rate stays its
card rate, which is why the rate multipliers average to about 1.

The footprint is deliberately mixed: Adventure Inc and CTS Consulting both run
Bengaluru and Manila, so there is comparable work to consolidate, and InfoSystems
sits onshore in Zurich and London, which is what its $90 rate and its numbers
are made of. Inside a vendor the spread is about 20 points, Bengaluru at 67%
against Belfast at 47%.

A site billing above `highRateUsdPerHour` is a high-rate site, and Utilization at
High-rate Locations reads only those. Weighted across every site the metric is
effective utilization with a different name, which is what it was until 1.5.

## Seats

Over and Under Utilized Employee are shares of people, not of hours. Each seat in
a vendor's headcount gets a deterministic lognormal draw around that vendor's
effective utilization for the window, scattered by
`personality.utilizationSpread`; seats are counted over 100 percent and under 70
percent. Vendors with no data in the window contribute no seats rather than
counting as fully under-utilized. The thresholds are in
`config/thresholds.json` under `employeeUtilization`.

The draw used to be uniform between a tenth and 2.15 times the mean. That put as
many people at 6% as at 120%, left 79% of a roster outside the healthy band, and
capped a seat at 2.15 times the mean, so InfoSystems at 45% could not produce a
single person over 100% and the worst vendor in the book reported that nobody was
overworked. A test now asserts every vendor can show one.

Most people landing under 70% is the finding, not a defect. A portfolio running
at 56% effective utilization against a 70% floor has three quarters of its roster
below that floor by arithmetic.

## What the calibration test checks

`tests/engine.test.ts` asserts twenty-six figures per vendor for Yearly 2026,
the five portfolio targets the model is calibrated to (60% capacity utilization,
$40.34M leakage value, 550K Hours Shortfall, 380 FTE equivalent, 9.32%
overtime), that each vendor travels the arc it was given, that high-rate
utilization is a different number from effective utilization, that every vendor
can show an overworked person,
the identities above, and then walks every single day of 2026 to confirm two
things: that no day is missing any series, and that no day prints a utilization
over 100 percent. It then walks every day of eleven years checking that no key
escapes the key it is a subset of: productive inside expected and inside logged,
idle inside non-productive, overtime inside logged, completed inside target and
onTime inside completed. It runs in about a second with no browser. If you change the
data on purpose, it tells you exactly which numbers moved.
