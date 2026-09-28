import { expect, test } from '@playwright/test'

/* Filter coverage. Every control must change the numbers on screen.
 * Run with:  npm run test:ui   (or npx playwright test) */

const LENSES = ['vendorPerformance', 'deliveryPerformance', 'capacityUtilizationHealth', 'costEfficiency']

const hero = (page: import('@playwright/test').Page) =>
  page.$$eval('.kpi .kpi-val', els => els.map(e => e.textContent).join('|'))

test.describe('lens pages', () => {
  for (const lens of LENSES) {
    test(`${lens}: every filter recomputes`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', e => errors.push(String(e)))

      await page.goto(`/#/${lens}`)
      await expect(page.locator('.vhead')).toHaveCount(3)

      // period tabs
      const seen = new Set<string>()
      for (const p of ['Yearly', 'Quaterly', 'Monthly', 'Weekly']) {
        await page.click(`[data-period="${p}"]`)
        seen.add(await hero(page))
      }
      expect(seen.size, 'each period produces a different hero row').toBeGreaterThan(2)

      // year picker
      await page.click('[data-period="Yearly"]')
      const before = await hero(page)
      await page.click('[data-pop="date"]')
      await page.click('[data-popbody="date"] [data-setyear="2025"]')
      await expect(page.locator('[data-pop="date"] .cv')).toHaveText('2025')
      expect(await hero(page)).not.toBe(before)

      // quarter picker
      await page.click('[data-period="Quaterly"]')
      await page.click('[data-pop="date"]')
      await page.click('[data-popbody="date"] [data-setq="1"]')
      await expect(page.locator('[data-pop="date"] .cv')).toHaveText('Q1 2025')

      // month picker
      await page.click('[data-period="Monthly"]')
      await page.click('[data-pop="date"]')
      await page.click('[data-popbody="date"] [data-setmonth="3"]')
      await expect(page.locator('[data-pop="date"] .cv')).toHaveText('Apr 2025')

      // day range
      await page.click('[data-period="Weekly"]')
      await page.click('[data-pop="date"]')
      const days = page.locator('[data-popbody="date"] [data-day]')
      await days.nth(9).click()
      await days.nth(13).click()
      await expect(page.locator('[data-pop="date"] .cv')).toContainText('–')

      // vendor multiselect narrows the grid
      await page.click('[data-period="Yearly"]')
      await page.click('[data-pop="vend"]')
      await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
      await page.locator('[data-popbody="vend"] .vendOpt').nth(1).uncheck()
      await page.click('[data-popbody="vend"] [data-act="vendApply"]')
      await expect(page.locator('.vhead')).toHaveCount(1)

      // metric chip narrows the sections
      const sectionsAll = await page.locator('.sect').count()
      const chips = page.locator('.chip')
      await chips.nth(await chips.count() - 1).click()
      expect(await page.locator('.sect').count()).toBeLessThan(sectionsAll)

      // reset restores everything
      await page.click('[data-act="reset"]')
      await expect(page.locator('.vhead')).toHaveCount(3)

      // the vertical list will not go to zero, so the page is never empty
      await page.click('[data-pop="vert"]')
      await page.click('[data-testid="vert-all"]')
      await page.click('[data-popbody="vert"] [data-act="vertApply"]')
      expect(await page.locator('.vhead').count()).toBeGreaterThan(0)
      await expect(page.locator('.nodata')).toHaveCount(0)

      expect(errors, 'no console errors').toEqual([])
    })
  }
})

test('vendor detail opens, recomputes and returns', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto('/#/vendorPerformance')
  await page.locator('.vhead').first().click()
  await expect(page.locator('.phead h1')).toHaveText('Adventure Inc')

  const seen = new Set<string>()
  for (const p of ['Yearly', 'Quaterly', 'Monthly', 'Weekly']) {
    await page.click(`[data-dperiod="${p}"]`)
    seen.add(await page.$$eval('.dkpi .v', els => els.map(e => e.textContent).join('|')))
  }
  expect(seen.size).toBeGreaterThan(2)

  await page.click('[data-act="back"]')
  await expect(page.locator('.phead h1')).toHaveText('Vendor Performance')
  expect(errors).toEqual([])
})

test('the build ships as a single role, with no view switcher on the page', async ({ page }) => {
  // config/roles.json has showSwitcher false: every lens is reachable from the
  // rail and nothing asks the viewer to pick a persona first
  await page.goto('/')
  await expect(page.locator('[data-testid="role-switcher"]')).toHaveCount(0)
  await expect(page.locator('.roleswitch')).toHaveCount(0)
  await expect(page.locator('.phead h1')).toHaveText('Vendor Performance')
})

test('metric tooltips are keyboard reachable and carry the spec copy', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  const info = page.locator('.info-btn').first()
  await info.focus()
  await expect(page.locator('.info-pop').first()).toBeVisible()
  await expect(info).toHaveAttribute('aria-label', /Productive work delivered/)
})

test('chart hover shows a tooltip', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.locator('.sect .chart .hotpt').first().hover()
  await expect(page.locator('.chart-tip')).toBeVisible()
})

/* ------------------------------------------------------------------ *
 *  Regression guards from the September audit. Each of these would
 *  have caught a defect that shipped in v1.0.
 * ------------------------------------------------------------------ */

test('columns render at their real height, not a CSS-collapsed one', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.waitForSelector('.col-bar')
  const boxes = await page.$$eval('.col-bar', els =>
    els.map(e => (e as SVGGraphicsElement).getBBox().height))
  expect(boxes.length, 'columns are drawn at all').toBeGreaterThan(10)
  // a CSS rule leaking onto the SVG once pinned every bar to 7px
  expect(Math.max(...boxes), 'tallest column is a real height').toBeGreaterThan(40)
  expect(boxes.filter(h => h > 0 && h < 4).length, 'no collapsed columns').toBe(0)
})

test('paired columns overlay on the category, as the product draws them', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.waitForSelector('.col-bar')
  const geo = await page.evaluate(() => {
    const sect = [...document.querySelectorAll('.sect')]
      .find(s => s.querySelector('h3')?.textContent?.includes('Output Rate') && s.querySelector('.col-bar'))
    const bars = [...(sect?.querySelectorAll('.col-bar') ?? [])]
      .map(e => (e as SVGGraphicsElement).getBBox())
    return bars.slice(0, 2).map(b => ({ mid: +(b.x + b.width / 2).toFixed(1), w: +b.width.toFixed(1) }))
  })
  expect(geo.length).toBe(2)
  // same centre: overlaid, not side by side
  expect(Math.abs(geo[0].mid - geo[1].mid)).toBeLessThan(0.6)
  // and the front series is the narrower one
  expect(geo[1].w).toBeLessThan(geo[0].w)
})

test('filter buttons are disabled when there is nothing to do', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-pop="vend"]')
  await expect(page.locator('[data-act="vendReset"]')).toBeDisabled()
  await expect(page.locator('[data-act="vendApply"]')).toBeDisabled()
  await expect(page.locator('[data-act="reset"]')).toBeDisabled()
  await expect(page.locator('[data-act="apply"]')).toBeDisabled()
})

test('popover Apply commits the staged selection and closes', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-pop="vend"]')
  await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
  // staging must not touch the page yet
  await expect(page.locator('.vhead')).toHaveCount(3)
  await expect(page.locator('[data-act="vendApply"]')).toBeEnabled()
  await page.click('[data-act="vendApply"]')
  await expect(page.locator('.vhead')).toHaveCount(2)
  await expect(page.locator('[data-popbody="vend"]')).toHaveClass(/hidden/)
})

test('the page-level Apply commits the staged selection too', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-pop="vend"]')
  await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
  await expect(page.locator('[data-act="apply"]')).toBeEnabled()
  await page.click('[data-act="apply"]')
  await expect(page.locator('.vhead')).toHaveCount(2)
  await expect(page.locator('[data-pop="vend"] .cv')).toHaveText(/\+ 1 More/)
})

test('popover Reset restores everything, applies it and closes', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-pop="vend"]')
  await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
  await page.click('[data-act="vendApply"]')
  await expect(page.locator('.vhead')).toHaveCount(2)

  await page.click('[data-pop="vend"]')
  await expect(page.locator('[data-act="vendReset"]')).toBeEnabled()
  await page.click('[data-act="vendReset"]')
  await expect(page.locator('.vhead')).toHaveCount(3)
  await expect(page.locator('[data-pop="vend"] .cv')).toHaveText('All Vendor')
  await expect(page.locator('[data-popbody="vend"]')).toHaveClass(/hidden/)
})

test('page-level Reset restores the whole filter bar', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-period="Monthly"]')
  await page.click('[data-pop="vend"]')
  await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
  await page.click('[data-act="vendApply"]')
  await expect(page.locator('[data-act="reset"]')).toBeEnabled()
  await page.click('[data-act="reset"]')
  await expect(page.locator('.vhead')).toHaveCount(3)
  await expect(page.locator('[data-period="Yearly"]')).toHaveClass(/on/)
  await expect(page.locator('[data-act="reset"]')).toBeDisabled()
})

test('each vertical scopes the page to its own vendors', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-pop="vert"]')
  await page.locator('[data-popbody="vert"] .vertOpt').nth(0).uncheck()
  await page.click('[data-act="vertApply"]')
  await expect(page.locator('.vhead')).toHaveCount(1)
  await expect(page.locator('.vhead .vname')).toHaveText('InfoSystems')

  // and the one remaining vertical cannot be turned off
  await page.click('[data-pop="vert"]')
  await expect(page.locator('[data-popbody="vert"] .vertOpt').nth(1)).toBeDisabled()
  await expect(page.locator('[data-popbody="vert"] .vertOpt').nth(0)).toBeEnabled()
})

test('headcount aside is the sum of the designations', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  const check = await page.evaluate(() => {
    const sect = [...document.querySelectorAll('.sect')]
      .find(s => s.querySelector('h3')?.textContent?.includes('Headcount by Designation'))
    const aside = sect?.querySelector('.aside')?.textContent ?? ''
    const counts = [...(sect?.querySelectorAll('.rl b') ?? [])].map(b => Number(b.textContent))
    return { aside, sum: counts.reduce((a, b) => a + b, 0) }
  })
  expect(check.aside).toBe(`${check.sum} headcount`)
})

test('the two employee tiles carry no period comparison', async ({ page }) => {
  await page.goto('/#/capacityUtilizationHealth')
  for (const label of ['Over Utilized Employee', 'Under Utilized Employee']) {
    const tile = page.locator('.kpi', { hasText: label })
    await expect(tile.locator('.delta')).toHaveCount(0)
  }
})

test('metric names follow config/copy.json', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await expect(page.locator('.kpi-label', { hasText: 'Financial Impact' })).toHaveCount(1)
  await page.goto('/#/capacityUtilizationHealth')
  await expect(page.locator('.sect h3', { hasText: 'Idle Time Cost' }).first()).toBeVisible()
  // the key-value row inside the card follows the same rename
  await expect(page.locator('.sect .kv', { hasText: 'Idle Time Cost' }).first()).toBeVisible()
})

test('the x-axis caption follows the period, not a hardcoded label', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  await page.click('[data-period="Yearly"]')
  const caps = await page.$$eval('.sect .xcap', els => els.map(e => e.textContent))
  expect(caps.length).toBeGreaterThan(0)
  expect(caps.every(c => c === 'Month'), `captions were ${caps.join(',')}`).toBe(true)
  await page.click('[data-period="Weekly"]')
  const weekly = await page.$$eval('.sect .xcap', els => els.map(e => e.textContent))
  expect(weekly.every(c => c === 'Day'), `captions were ${weekly.join(',')}`).toBe(true)
  // the portfolio band's axis is skills, not time, so its caption does not move
  await expect(page.locator('.band .xcap')).toHaveText('Skill Set')
})

/* ------------------------------------------------------------------ *
 *  Cost Efficiency, September 2026. Richard's review notes, built.
 * ------------------------------------------------------------------ */

test('the Cost Efficiency hero is five tiles in one row', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const tiles = page.locator('.kpis .kpi')
  await expect(tiles).toHaveCount(5)
  await expect(page.locator('.kpi-label')).toHaveText([
    /Leakage Value/, /Capacity Utilization/, /Hours not delivered/,
    /Excess FTEs/, /Upcoming Contract Renewals/,
  ])
  // one row: every tile starts at the same y, and every number does too
  const tops = await page.$$eval('.kpis .kpi', els =>
    [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])
  expect(tops.length, 'the hero strip never wraps to a second row').toBe(1)
  const vals = await page.$$eval('.kpi-val', els =>
    [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])
  expect(vals.length, 'the numbers line up whatever the label length').toBe(1)
})

test('SLA Compliance has left the Cost Efficiency lens entirely', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  await expect(page.locator('.kpi-label', { hasText: 'SLA Compliance' })).toHaveCount(0)
  await expect(page.locator('.sect h3', { hasText: 'SLA Compliance' })).toHaveCount(0)
  await expect(page.locator('.chip', { hasText: 'SLA Compliance' })).toHaveCount(0)
  // and is still on Delivery, where it belongs
  await page.goto('/#/deliveryPerformance')
  await expect(page.locator('.kpi-label', { hasText: 'SLA Compliance' })).toHaveCount(1)
})

test('the renewals tile opens the list of contracts behind the count', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const tile = page.locator('.kpi', { hasText: 'Upcoming Contract Renewals' })
  await expect(tile.locator('.kpi-val')).toHaveText(/3/)
  await expect(page.locator('.kpi-pop')).toHaveCount(0)
  await tile.locator('[data-kpi-detail="contractRenewals"]').click()
  await expect(page.locator('.kpi-pop')).toBeVisible()
  await expect(page.locator('.kpi-pop-r')).toHaveCount(3)
  await expect(page.locator('.kpi-pop-r').first()).toContainText('InfoSystems')
  await expect(page.locator('.kpi-pop-r').first()).toContainText('15 Oct 2026')
  // it does not run off the right edge of the page
  const box = await page.locator('.kpi-pop').boundingBox()
  const vw = page.viewportSize()!.width
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
  await page.click('h1')
  await expect(page.locator('.kpi-pop')).toHaveCount(0)
})

test('Leakage Breakdown splits the leak by where it went', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const card = page.locator('.sect', { hasText: 'Leakage Breakdown' }).first()
  await expect(card.locator('.bignum')).toHaveText(/%$/)
  await expect(card.locator('.badge')).toHaveCount(1)   // one of the two production badges
  // three named slices, drawn as one bar across contracted capacity
  await expect(card.locator('.stack > i')).toHaveCount(4)   // three slices plus the rest
  for (const row of ['Idle time', 'Non-core activities', 'Non-billable work',
                     'Total leakage', 'Unproductive FTEs'])
    await expect(card.locator('.slg', { hasText: row })).toHaveCount(1)
  // hours in the legend, the money beside them
  await expect(card.locator('.slg').first().locator('em')).toHaveText(/^\$/)
  await expect(card.locator('.col-bar').first()).toBeVisible()
  // the slices add up to the headline percentage
  const shares = await card.locator('.stack > i:not(.rest)').evaluateAll(
    els => els.map(e => parseFloat((e as HTMLElement).style.width)))
  const head = parseFloat((await card.locator('.bignum').textContent()) ?? '0')
  expect(Math.abs(shares.reduce((a, b) => a + b, 0) - head),
    'the bar is the headline number').toBeLessThan(1)
})

test('Partner Efficiency replaces the single cost figure', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  await expect(page.locator('.sect h3', { hasText: 'Billable Portfolio Cost' })).toHaveCount(0)
  const card = page.locator('.sect', { hasText: 'Partner Efficiency' }).first()
  // workforce size on the left, the part you are not getting on the right
  await expect(card.locator('.pepair > div')).toHaveCount(2)
  await expect(card.locator('.pepair')).toContainText('Employees')
  await expect(card.locator('.pepair')).toContainText('Excess FTEs')
  // contract value split in two: what the work you got cost, and what the work
  // you did not get cost
  await expect(card.locator('.stack > i')).toHaveCount(2)
  for (const row of ['Verified Cost', 'Cost of the gap', 'Contract Value',
                     'Cost per productive hour'])
    await expect(card.locator('.slg', { hasText: row })).toHaveCount(1)
  const shares = await card.locator('.stack > i').evaluateAll(
    els => els.map(e => parseFloat((e as HTMLElement).style.width)))
  expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 100),
    'actual plus gap is the whole contract').toBeLessThan(1)
})

test('Overtime shows tracked against claimed', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const card = page.locator('.sect', { hasText: 'Overtime Integrity' }).first()
  await expect(card.locator('.badge')).toHaveCount(0)
  await expect(card.locator('.kv > div')).toHaveCount(5)
  await expect(card.locator('.kv', { hasText: 'Overtime tracked' })).toHaveCount(1)
  await expect(card.locator('.kv', { hasText: 'Overtime claimed' })).toHaveCount(1)
  // the vendor claiming more than it worked says so, in red
  const cards = page.locator('.sect', { hasText: 'Overtime Integrity' })
  const flagged = await cards.locator('.kv b.bad').count()
  expect(flagged, 'the over-claiming vendors are flagged').toBeGreaterThan(0)
})

test('At-Risk Vendors counts one and names it', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  // the old rule needed utilization over 85 and SLA under 90, which no vendor
  // in a portfolio running at 60% can do, so all three read Medium and this
  // tile read 0 beside a vendor scoring 37
  const tile = page.locator('.kpi', { hasText: 'At-Risk Vendors' })
  await expect(tile.locator('.kpi-val')).toContainText('1')
  // the Risk Status card is gone: it printed the Vendor Score's band a second
  // time, in 54px, at the top of every column
  await expect(page.locator('.vgrid h3', { hasText: 'Risk Status' })).toHaveCount(0)
  // and the count carries the list
  await page.click('[data-kpi-detail="atRiskVendors"]')
  const pop = page.locator('.kpi-pop')
  await expect(pop).toContainText('InfoSystems')
  await expect(pop).toContainText(/score 37/)
})

test('the vendor page carries the money beside the verdict', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await expect(page.locator('.vgrid h3', { hasText: 'Financial Impact' })).toHaveCount(3)
  // and no designation strip: it moved three ratios and decided nothing
  await expect(page.locator('.vdesig')).toHaveCount(0)
  await page.goto('/#/costEfficiency')
  await expect(page.locator('.vdesig'), 'it stays where it rescales money').toHaveCount(3)
})

test('every project risk reads in tasks', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  await page.locator('button.rcchip').first().click()
  const note = await page.locator('.rcnote').textContent()
  expect(note, `got "${note}"`).toMatch(/tasks late or undelivered/)
  expect(note, 'no unitless "points"').not.toMatch(/points/)
  // and the flag agrees with the number beside it
  const pct = parseFloat((note ?? '').match(/([\d.]+)% on time/)?.[1] ?? '100')
  expect(pct, 'an at-risk chip is under the floor').toBeLessThan(70)
})

test('the designation strip narrows a whole vendor column', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const strip = page.locator('.vdesig').first()
  await expect(strip.locator('.dtab')).toHaveText(
    ['All', 'Associate', 'Senior Associate', 'Lead', 'Manager'])
  await expect(strip.locator('.dtab.on')).toHaveText('All')

  const before = await page.locator('.sect', { hasText: 'Partner Efficiency' })
    .first().locator('.slg b').first().textContent()
  await strip.locator('[data-desig$="|Lead"]').click()
  await expect(strip.locator('.dtab.on')).toHaveText('Lead')
  const after = await page.locator('.sect', { hasText: 'Partner Efficiency' })
    .first().locator('.slg b').first().textContent()
  expect(after, 'the column recomputes').not.toBe(before)

  // and only that column: the second vendor is untouched
  await expect(page.locator('.vdesig').nth(1).locator('.dtab.on')).toHaveText('All')
  await strip.locator('[data-desig$="|Lead"]').click()
  await expect(strip.locator('.dtab.on')).toHaveText('All')
})

test('the vendor tier tag is on every card', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  await expect(page.locator('.vtier')).toHaveCount(3)
  await expect(page.locator('.vtier.strategic')).toHaveCount(1)
  await expect(page.locator('.vtier.tactical')).toHaveCount(2)
})

test('the Delivery lens carries what a delivery head asks for', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  await expect(page.locator('.phead h1')).toHaveText('Delivery Performance')
  await expect(page.locator('.kpi-label')).toHaveText([
    /Financial Impact/, /Excess FTEs/, /SLA Compliance/,
    /Projects at Risk/, /Tactical . Strategic Vendors/,
  ])
  await expect(page.locator('.kpi', { hasText: 'Projects at Risk' })
    .locator('.kpi-val')).toHaveText(/3 of 6/)

  for (const s of ['On-Time Delivery', 'Output Rate', 'Contract Burn', 'Penalty Exposure'])
    await expect(page.locator('.sect h3', { hasText: s }).first()).toBeVisible()
  for (const b of ['Vendor Dependency Risk', 'Consolidation Levers', 'SLA Risk Summary'])
    await expect(page.locator('.band-t h3', { hasText: b })).toHaveCount(1)
})

test('Contract Burn shows the overrun on the bar, not in a sentence', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  const cards = page.locator('.sect', { hasText: 'Contract Burn' })
  await expect(cards).toHaveCount(3)
  // no warning text anywhere: the mark on the bar is the reading
  await expect(page.locator('.burnwarn')).toHaveCount(0)
  await expect(cards.first()).not.toContainText('budget runs out')
  await expect(cards.first()).not.toContainText('inside the contract term')
  // two bars on one scale: budget above, calendar below
  const geo = await cards.first().evaluate(el => {
    const bars = [...el.querySelectorAll('.burnrow .bar > i')] as HTMLElement[]
    return {
      rows: el.querySelectorAll('.burnrow').length,
      budget: parseFloat(bars[0].style.width),
      term: parseFloat(bars[1].style.width),
      over: !!el.querySelector('.burnrow .bar.over'),
    }
  })
  expect(geo.rows, 'money above, calendar below').toBe(2)
  expect(geo.budget, 'budget spent runs past the term').toBeGreaterThan(geo.term)
  expect(geo.over, 'and the bar says so without a sentence').toBe(true)
  // and it is a warning, not a threshold pill
  await expect(cards.first().locator('.badge')).toHaveCount(0)
  await expect(cards.nth(1).locator('.burnwarn')).toHaveCount(0)
})

test('the SLA risk summary is one row per vendor, worst first', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  const rows = page.locator('.rcrow')
  await expect(rows, 'a row per vendor, not a block per project').toHaveCount(3)
  await expect(rows.first().locator('.rcv')).toHaveText('InfoSystems')   // 1 of 1 at risk
  await expect(page.locator('.rcchip')).toHaveCount(6)               // every project
  await expect(page.locator('.rcchip.critical')).toHaveCount(3)
  // the reason is one tap away rather than always on screen
  await expect(page.locator('.rcnote')).toHaveCount(0)
  await page.locator('button.rcchip').first().click()
  await expect(page.locator('.rcnote')).toHaveCount(1)
  await page.locator('button.rcchip').first().click()
  await expect(page.locator('.rcnote')).toHaveCount(0)
})

test('the risk band is a fraction of the height the list was', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  const band = page.locator('.band', { hasText: 'SLA Risk Summary' })
  const h = (await band.boundingBox())?.height ?? 0
  expect(h, 'six stacked project blocks were 437px').toBeLessThan(260)
})

test('Vendor Dependency Risk states the concentration without a pill', async ({ page }) => {
  await page.goto('/#/deliveryPerformance')
  const band = page.locator('.band', { hasText: 'Vendor Dependency Risk' })
  await expect(band.locator('.badge')).toHaveCount(0)
  // a ring, not a share bar: three shares of one whole
  await expect(band.locator('.concring circle, .concrow svg circle')).toHaveCount(3)
  // the caption carries the reading; the sentence naming the consequence and
  // the one proposing a remedy were both cut on 25 Sep
  await expect(band.locator('.statcap')).toContainText(/delivered work sits with/)
  await expect(band.locator('.band-insight')).toHaveCount(0)
  const shares = await band.locator('.band-legend .lg b').allTextContents()
  expect(Math.round(shares.reduce((a, b) => a + parseFloat(b), 0)), 'shares add to 100').toBe(100)
})

test('Consolidation Levers compares on four dimensions', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const band = page.locator('.band', { hasText: 'Consolidation Levers' })
  const sel = band.locator('[data-testid="consolidationLevers-compare"]')
  await expect(sel.locator('option')).toHaveText(['Skill Set', 'Designation', 'Project', 'Location'])

  const seen = new Set<string>()
  for (const dim of ['skillSet', 'designation', 'project', 'location']) {
    await sel.selectOption(dim)
    const cats = await band.locator('svg text').allTextContents()
    seen.add(cats.join('|'))
    await expect(band.locator('.col-bar').first()).toBeVisible()
  }
  expect(seen.size, 'each dimension draws different categories').toBe(4)

  await sel.selectOption('designation')
  const labels = await band.locator('svg text').allTextContents()
  for (const d of ['Associate', 'Senior Associate', 'Lead', 'Manager'])
    expect(labels, `${d} is on the axis`).toContain(d)
  // no insight line: it restated the tallest and shortest bar
  await expect(band.locator('.band-insight')).toHaveCount(0)
})

test('no axis label leaves its card, at any width, on any dimension', async ({ page }) => {
  // a tilted project name reached 95px down a 40px axis margin and hung out of
  // the card. labelFit only tilts what fits the margin now, and cuts the rest.
  for (const w of [1180, 1520]) {
    await page.setViewportSize({ width: w, height: 900 })
    for (const lens of LENSES) {
      await page.goto(`/#/${lens}`)
      for (const dim of ['skillSet', 'project', 'location']) {
        const sel = page.locator('[data-testid="consolidationLevers-compare"]')
        if (await sel.count()) { await sel.selectOption(dim); await page.waitForTimeout(120) }
        const out = await page.evaluate(() => {
          let n = 0
          for (const card of document.querySelectorAll('.sect, .band')) {
            const b = card.getBoundingClientRect()
            for (const t of card.querySelectorAll('.chart svg text')) {
              const r = t.getBoundingClientRect()
              if (r.right > b.right + 0.5 || r.bottom > b.bottom + 0.5) n++
            }
          }
          return n
        })
        expect(out, `${lens} at ${w}, compare by ${dim}`).toBe(0)
      }
    }
  }
})

test('the band narrows with the vendor filter', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  await expect(page.locator('.band-legend .lg')).toHaveCount(3)
  await page.click('[data-pop="vend"]')
  await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
  await page.click('[data-act="vendApply"]')
  await expect(page.locator('.band-legend .lg')).toHaveCount(2)
  await expect(page.locator('.band .col-bar')).toHaveCount(8)
})

test('the metric names Richard called out are gone', async ({ page }) => {
  for (const lens of LENSES) {
    await page.goto(`/#/${lens}`)
    const body = await page.locator('body').innerText()
    for (const dead of ['Billable Portfolio Cost', 'OT Cost at Risk',
                        'Employees Over Threshold', 'Productivity Comparison',
                        'Grade of Resource', 'Band 1'])
      expect(body, `${dead} still on ${lens}`).not.toContain(dead)
  }
})

test('a rising cost reads red even though the arrow points up', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const tone = await page.$$eval('.kpi', els => els.map(e => ({
    label: e.querySelector('.kpi-label')?.textContent?.trim() ?? '',
    cls: e.querySelector('.delta')?.className ?? '',
  })))
  for (const t of tone.filter(x => /Leakage Value|Hours not delivered|Excess FTEs/.test(x.label))) {
    if (!t.cls) continue
    const up = /\bup\b/.test(t.cls)
    expect(t.cls, `${t.label} going ${up ? 'up' : 'down'} must read ${up ? 'bad' : 'good'}`)
      .toContain(up ? 't-bad' : 't-good')
  }
})

test('no page shows an empty state in any period', async ({ page }) => {
  for (const lens of LENSES) {
    await page.goto(`/#/${lens}`)
    for (const p of ['Yearly', 'Quaterly', 'Monthly', 'Weekly']) {
      await page.click(`[data-period="${p}"]`)
      await expect(page.locator('.nodata'), `${lens} / ${p}`).toHaveCount(0)
      const body = await page.locator('body').innerText()
      expect(body, `${lens} / ${p} has no broken numbers`).not.toMatch(/NaN|Infinity/)
    }
  }
})

test('the future is not selectable, so no window can come back empty', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  // years
  await page.click('[data-period="Yearly"]')
  await page.click('[data-pop="date"]')
  await expect(page.locator('[data-popbody="date"] [data-setyear="2027"]')).toBeDisabled()
  await expect(page.locator('[data-popbody="date"] [data-setyear="2026"]')).toBeEnabled()
  await page.keyboard.press('Escape')
  // quarters: today is 15 Sep 2026, so Q4 is out
  await page.click('[data-period="Quaterly"]')
  await page.click('[data-pop="date"]')
  await expect(page.locator('[data-popbody="date"] [data-setq="4"]')).toBeDisabled()
  await expect(page.locator('[data-popbody="date"] [data-setq="3"]')).toBeEnabled()
  await page.keyboard.press('Escape')
  // months
  await page.click('[data-period="Monthly"]')
  await page.click('[data-pop="date"]')
  await expect(page.locator('[data-popbody="date"] [data-setmonth="9"]')).toBeDisabled()
  await expect(page.locator('[data-popbody="date"] [data-setmonth="8"]')).toBeEnabled()
  await page.keyboard.press('Escape')
  // days, and the arrow that would page into next month
  await page.click('[data-period="Weekly"]')
  await page.click('[data-pop="date"]')
  await expect(page.locator(`[data-popbody="date"] [data-day="${Date.UTC(2026, 8, 16)}"]`)).toBeDisabled()
  await expect(page.locator(`[data-popbody="date"] [data-day="${Date.UTC(2026, 8, 15)}"]`)).toBeEnabled()
  await expect(page.locator('[data-popbody="date"] .pop-nav[aria-label="Next"]')).toBeDisabled()
})

test('weekends carry data, so a weekend window is not blank', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  await page.click('[data-period="Weekly"]')
  await page.click('[data-pop="date"]')
  await page.click(`[data-day="${Date.UTC(2026, 8, 12)}"]`)   // Saturday
  await page.click(`[data-day="${Date.UTC(2026, 8, 13)}"]`)   // Sunday
  await page.click('h1')
  await expect(page.locator('.nodata')).toHaveCount(0)
  await expect(page.locator('.vhead')).toHaveCount(3)
  const hero = await page.$$eval('.kpi-val', els => els.map(e => e.textContent ?? ''))
  expect(hero.every(v => v && v !== '0' && v !== '0%'), `hero read ${hero.join(' | ')}`).toBe(true)
})

test.describe('iPad Air, landscape', () => {
  test.use({ viewport: { width: 1180, height: 820 } })

  test('renders at 100% with no horizontal scroll and no wrapped filter row', async ({ page }) => {
    await page.goto('/#/costEfficiency')
    const m = await page.evaluate(() => ({
      zoom: getComputedStyle(document.querySelector('.sheet')!).zoom,
      scrollW: document.documentElement.scrollWidth,
      viewW: window.innerWidth,
      heroRows: new Set([...document.querySelectorAll('.kpis .kpi')]
        .map(e => Math.round(e.getBoundingClientRect().top))).size,
      // the label is vertically centred, so compare the controls only
      filterRows: new Set([...document.querySelectorAll('.frow')[0]
        .querySelectorAll(':scope > .seg, :scope > .picker')]
        .map(e => Math.round(e.getBoundingClientRect().top))).size,
      fitbar: document.querySelectorAll('.fitbar').length,
    }))
    expect(m.zoom, 'type is at its real size, not scaled down').toBe('1')
    expect(m.scrollW, 'nothing hangs off the right edge').toBeLessThanOrEqual(m.viewW)
    expect(m.heroRows, 'five hero tiles in one row').toBe(1)
    expect(m.filterRows, 'the filter controls stay on one line').toBe(1)
    expect(m.fitbar, 'no floating view control when nothing needs scaling').toBe(0)
  })

  test('every hero number lines up, on every lens', async ({ page }) => {
    // an iPad tile is narrow enough to wrap a label to three lines, which used
    // to drop that one number below the rest of the strip
    for (const lens of LENSES) {
      await page.goto(`/#/${lens}`)
      const rows = await page.$$eval('.kpi-val', els =>
        [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])
      expect(rows.length, `${lens} numbers sit on one baseline`).toBe(1)
    }
    // the vendor page's eight tiles are two rows of four, so two baselines
    await page.goto('/#/costEfficiency/PH%20Engineering')
    const dr = await page.$$eval('.dkpi .v', els =>
      [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])
    expect(dr.length, 'the vendor tiles sit on one baseline per row').toBe(2)
  })

  test('every tap target clears 32px', async ({ page }) => {
    await page.goto('/#/costEfficiency')
    const small = await page.evaluate(() => {
      const out: string[] = []
      for (const el of document.querySelectorAll('button, input[type=checkbox], select, .opt')) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        // info buttons carry an invisible ::after pad of 12px on every side
        const pad = el.classList.contains('info-btn') ? 24 : 0
        if (Math.min(r.width + pad, r.height + pad) < 32)
          out.push(`${el.className || el.tagName} ${Math.round(r.width + pad)}x${Math.round(r.height + pad)}`)
      }
      return [...new Set(out)]
    })
    expect(small, small.join(' / ')).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 *  Second review pass, 23 Sep 2026.
 * ------------------------------------------------------------------ */

test('the rail carries its bottom block, collapsed and expanded', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  // collapsed: four icons and the avatar
  await expect(page.locator('.rail-icons-foot .ricon')).toHaveCount(4)
  await expect(page.locator('.rail-icons-foot .avatar')).toBeVisible()
  // expanded: the same four as labelled rows, plus who is signed in
  await page.click('.rail-toggle')
  await expect(page.locator('.rail-foot .fl')).toHaveText([
    'Instances', 'Company Settings', 'Help', 'Sign out',
  ])
  await expect(page.locator('.rail-foot .avatar-name')).toHaveText('Product Manager')
})

test('a tooltip at the foot of the page is not clipped by its row', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const icon = page.locator('.vprow').last().locator('.info-btn').first()
  await icon.scrollIntoViewIfNeeded()
  await icon.hover()
  const tip = page.locator('.info-pop')
  await expect(tip).toBeVisible()
  const box = (await tip.boundingBox())!
  const view = page.viewportSize()!
  expect(box.y, 'top edge on screen').toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, 'bottom edge on screen').toBeLessThanOrEqual(view.height)
  expect(box.x, 'left edge on screen').toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, 'right edge on screen').toBeLessThanOrEqual(view.width)
  // it is a child of body, not of the row that would clip it
  expect(await tip.evaluate(e => e.parentElement?.tagName)).toBe('BODY')
})

test('charts render one to one, so axis labels are the size they claim', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  // the width comes from a ResizeObserver, so give it a frame to land
  await expect.poll(async () => page.evaluate(() => {
    const svg = document.querySelector('.sect .chart svg')
    if (!svg) return -1
    const vb = Number((svg.getAttribute('viewBox') || '0 0 0 0').split(' ')[2])
    return Math.abs(Math.round(svg.getBoundingClientRect().width) - vb)
  })).toBeLessThanOrEqual(1)
  const m = await page.evaluate(() => {
    const out: { box: number; vb: number; font: number }[] = []
    for (const svg of document.querySelectorAll('.sect .chart svg')) {
      const vb = Number((svg.getAttribute('viewBox') || '0 0 0 0').split(' ')[2])
      const t = svg.querySelector('text')
      out.push({
        box: Math.round(svg.getBoundingClientRect().width),
        vb,
        font: t ? Math.round(parseFloat(getComputedStyle(t).fontSize)) : 0,
      })
    }
    return out
  })
  expect(m.length).toBeGreaterThan(3)
  for (const c of m) {
    // the drawing is never scaled up, which is what made 11px labels read as 16
    expect(Math.abs(c.box - c.vb), `box ${c.box} vs viewBox ${c.vb}`).toBeLessThanOrEqual(1)
    expect(c.font).toBe(11)
  }
})

test('axis labels tilt rather than collide once the column narrows', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  await page.click('[data-period="Quaterly"]')
  const flat = await page.evaluate(() => {
    const svg = document.querySelector('.sect .chart svg')!
    const labs = [...svg.querySelectorAll('text')]
      .filter(t => /^W\d+$/.test(t.textContent || ''))
    if (!labs.length) return { any: false, collide: 0 }
    const rotated = /rotate/.test(labs[0].getAttribute('transform') || '')
    if (rotated) return { any: true, collide: 0 }   // tilted labels are allowed to overlap boxes
    const b = labs.map(t => t.getBoundingClientRect())
    let collide = 0
    for (let i = 1; i < b.length; i++) if (b[i].left < b[i - 1].right - 0.5) collide++
    return { any: true, collide }
  })
  expect(flat.any).toBe(true)
  expect(flat.collide, 'flat labels never run into each other').toBe(0)
})

test('grouped bars are capped, the way the product caps its columns', async ({ page }) => {
  await page.goto('/#/costEfficiency')
  const widths = await page.$$eval('.band .col-bar', els =>
    [...new Set(els.map(e => Math.round((e as SVGGraphicsElement).getBBox().width)))])
  expect(widths.length, 'every bar the same width').toBe(1)
  expect(widths[0], 'no 90px slabs').toBeLessThanOrEqual(40)
  expect(widths[0]).toBeGreaterThan(8)
})

test('only Vendor Score and Leakage Summary carry a threshold badge', async ({ page }) => {
  // the shipped build badges exactly these two, audited 23 Sep 2026
  const badged = new Set<string>()
  for (const lens of LENSES) {
    await page.goto(`/#/${lens}`)
    for (const name of await page.$$eval('.sect', els => els.map(s => ({
      title: s.querySelector('h3')?.textContent?.trim() ?? '',
      badge: !!s.querySelector('.badge'),
    })))) if (name.badge) badged.add(name.title.replace(/\s+$/, ''))
  }
  expect([...badged].sort()).toEqual(['Leakage Breakdown', 'Vendor Score'])
})

test('only Financial Impact and its two components carry a drilldown chevron', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await expect(page.locator('.kpi-drill')).toHaveCount(1)
  await expect(page.locator('.kpi', { hasText: 'Financial Impact' }).locator('.kpi-drill')).toHaveCount(1)
  await page.goto('/#/capacityUtilizationHealth')
  await expect(page.locator('.kpi-drill')).toHaveCount(0)
  await page.goto('/#/costEfficiency')
  await expect(page.locator('.kpi-drill')).toHaveCount(2)
})

test('the Financial Impact drilldown replicates the shipped slide-out', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await expect(page.locator('[data-testid="cost-loss-panel"]')).toHaveCount(0)
  await page.click('[data-drill-metric="costAtRisk"]')
  const panel = page.locator('[data-testid="cost-loss-panel"]')
  await expect(panel).toBeVisible()

  // headline, the three hour figures, and its own period control
  await expect(panel.locator('[data-testid="cost-loss-total"]')).toHaveText('$34.24M')
  await expect(panel.locator('.dl-card .kv > div')).toHaveCount(3)
  await expect(panel).toContainText('Expected productive hours')
  await expect(panel).toContainText('Hours not delivered')
  await expect(panel).toContainText('Excess FTEs')
  await expect(panel.locator('[data-dlperiod]')).toHaveCount(4)
  await expect(panel).toContainText('Financial Impact Trend')

  // the two breakups, and they add up to the headline
  await expect(panel).toContainText('Vertical wise Breakup')
  await expect(panel.locator('.dl-leg')).toHaveCount(2)
  await expect(panel).toContainText('Vendor wise Breakup')
  await expect(panel.locator('.dl-vendor')).toHaveCount(3)
  const pcts = (await panel.locator('.dl-pct').allTextContents()).map(t => parseInt(t, 10))
  expect(pcts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99)

  // its period is its own: the page stays where it was
  await panel.locator('[data-dlperiod="Monthly"]').click()
  await expect(page.locator('[data-period="Yearly"]')).toHaveClass(/on/)

  await page.click('[data-act="costLossClose"]')
  await expect(panel).toHaveCount(0)
})

test('the drilldown scopes to the page filter and opens a vendor', async ({ page }) => {
  await page.goto('/#/vendorPerformance')
  await page.click('[data-pop="vend"]')
  await page.locator('[data-popbody="vend"] .vendOpt').nth(2).uncheck()
  await page.click('[data-act="vendApply"]')
  await page.click('[data-drill-metric="costAtRisk"]')
  await expect(page.locator('.dl-vendor')).toHaveCount(2)
  await page.locator('.dl-vendor').first().click()
  await expect(page.locator('[data-testid="cost-loss-panel"]')).toHaveCount(0)
  await expect(page.locator('.phead h1')).toHaveText('CTS Consulting')
})

test('no trend chart ends on a part period', async ({ page }) => {
  for (const period of ['Yearly', 'Quaterly', 'Monthly']) {
    await page.goto('/#/costEfficiency')
    await page.click(`[data-period="${period}"]`)
    const drop = await page.evaluate(() => {
      const line = document.querySelector('.sect .chart .area-line')?.getAttribute('d') ?? ''
      const ys = [...line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map(m => Number(m[1]))
      if (ys.length < 2) return 0
      // a part bucket used to send the last point to the axis floor
      return (ys[ys.length - 1] - ys[ys.length - 2]) / 190
    })
    expect(drop, `${period} last point does not fall off a cliff`).toBeLessThan(0.3)
  }
})
