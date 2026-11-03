// Browser tests: the real section, CSS and JS in headless Chromium.
// Run with: npm run test:browser
// First time on a new computer: npx playwright install chromium
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { buildPage, serve } = require('../helpers/page');
const { teeProduct } = require('../helpers/fixtures');

const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

let browser;

test.before(async () => {
  browser = await chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
});

async function openPage(options, viewport) {
  const html = await buildPage(Object.assign({ product: teeProduct() }, options));
  const server = await serve(html);
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForLoadState('load');
  if (await page.locator('size-chart').count()) {
    await page.waitForFunction(() => window.customElements.get('size-chart'));
  }
  return {
    page,
    errors,
    close: async () => {
      await page.close();
      await server.close();
    },
  };
}

function sizeEvents(page) {
  return page.evaluate(() =>
    (window.dataLayer || []).filter((entry) => typeof entry.event === 'string' && entry.event.indexOf('size') === 0)
  );
}

function publishVariant(page, variant) {
  return page.evaluate((v) => publish(PUB_SUB_EVENTS.variantChange, { data: { sectionId: 'main', html: null, variant: v } }), variant);
}

test('the trigger appears, opens the pop-up and sends size_chart_open', async () => {
  const { page, errors, close } = await openPage();
  try {
    const trigger = page.locator('[data-size-chart-open]');
    assert.equal(await trigger.isVisible(), true, 'trigger is visible once the chart has loaded');
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), false);

    await trigger.click();
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('overflow-hidden')), true);

    const events = await sizeEvents(page);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event: 'size_chart_open',
      product_id: '777',
      product_name: 'MCO Logo Tee',
      chart_name: 'Unisex tees',
      chart_display: 'modal',
      unit: 'in',
      open_trigger: 'button',
    });
    const published = await page.evaluate(() => window.publishedEvents.map((entry) => entry[0]));
    assert.deepEqual(published, ['size_chart_open'], 'also sent to Shopify.analytics.publish');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('the page-load size is highlighted', async () => {
  const { page, close } = await openPage();
  try {
    const selected = page.locator('tr.size-chart__row--selected');
    assert.equal(await selected.count(), 1);
    assert.equal(await selected.getAttribute('data-size'), 'M');
    assert.equal(await selected.getAttribute('aria-current'), 'true');
  } finally {
    await close();
  }
});

test('the unit switch converts every measurement and back without drift', async () => {
  const { page, close } = await openPage();
  try {
    await page.locator('[data-size-chart-open]').click();
    const firstRow = page.locator('tbody tr').first().locator('td');
    assert.deepEqual(await firstRow.allTextContents(), ['34-36', '28', '8.25']);

    await page.locator('[data-size-chart-unit="cm"]').click();
    assert.deepEqual(await firstRow.allTextContents(), ['86.4-91.4', '71.1', '21']);
    assert.equal(await page.locator('[data-size-chart-unit="cm"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-size-chart-unit="in"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('.size-chart__subheading [data-unit-label]').textContent(), 'measurements in centimeters');

    await page.locator('[data-size-chart-unit="in"]').click();
    assert.deepEqual(await firstRow.allTextContents(), ['34-36', '28', '8.25'], 'always converts from the original value');

    const events = await sizeEvents(page);
    assert.deepEqual(
      events.map((entry) => entry.event + ':' + entry.unit),
      ['size_chart_open:in', 'size_chart_unit_change:cm', 'size_chart_unit_change:in']
    );

    await page.locator('[data-size-chart-unit="in"]').click();
    assert.equal((await sizeEvents(page)).length, 3, 'clicking the current unit sends nothing');
  } finally {
    await close();
  }
});

test('Escape closes the pop-up and returns focus to the trigger', async () => {
  const { page, close } = await openPage();
  try {
    await page.locator('[data-size-chart-open]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), false);
    // The dialog's "close" event runs our clean-up a moment later.
    await page.waitForFunction(() => !document.body.classList.contains('overflow-hidden'));
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-size-chart-open')), true);
  } finally {
    await close();
  }
});

test('the close button and a backdrop click both close the pop-up', async () => {
  const { page, close } = await openPage();
  try {
    await page.locator('[data-size-chart-open]').click();
    await page.locator('[data-size-chart-close]').click();
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), false);

    await page.locator('[data-size-chart-open]').click();
    await page.mouse.click(5, 5);
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), false);
  } finally {
    await close();
  }
});

test('the trigger still works after Dawn replaces the product info HTML', async () => {
  const { page, close } = await openPage();
  try {
    // Dawn swaps in fresh HTML from the server on every variant change.
    await page.evaluate(() => {
      const info = document.querySelector('[data-product-info]');
      info.innerHTML = info.innerHTML;
    });
    await page.locator('[data-size-chart-open]').click();
    assert.equal(await page.locator('dialog').evaluate((d) => d.open), true);
  } finally {
    await close();
  }
});

test('choosing a size highlights its row and sends size_select once', async () => {
  const { page, close } = await openPage();
  try {
    await publishVariant(page, { id: 1003, options: ['Black', 'L'] });
    let events = await sizeEvents(page);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event: 'size_select',
      product_id: '777',
      product_name: 'MCO Logo Tee',
      chart_name: 'Unisex tees',
      chart_display: 'modal',
      variant_id: '1003',
      size: 'L',
      size_in_chart: true,
      chart_viewed: false,
    });
    assert.equal(await page.locator('tr.size-chart__row--selected').getAttribute('data-size'), 'L');

    // Same size, different colour: no new size event.
    await publishVariant(page, { id: 1006, options: ['White', 'L'] });
    assert.equal((await sizeEvents(page)).length, 1);

    // A variant from another product (for example a quick-add pop-up) is ignored.
    await publishVariant(page, { id: 5555, options: ['Red', 'S'] });
    assert.equal((await sizeEvents(page)).length, 1);
    assert.equal(await page.locator('tr.size-chart__row--selected').getAttribute('data-size'), 'L');

    // After opening the chart, chart_viewed is true.
    await page.locator('[data-size-chart-open]').click();
    await publishVariant(page, { id: 1004, options: ['White', 'S'] });
    events = await sizeEvents(page);
    const last = events[events.length - 1];
    assert.equal(last.event, 'size_select');
    assert.equal(last.size, 'S');
    assert.equal(last.chart_viewed, true);

    // An unavailable combination gives no variant: nothing happens.
    await publishVariant(page, null);
    assert.equal((await sizeEvents(page)).length, events.length);
  } finally {
    await close();
  }
});

test('inline display sends size_chart_open once, when the chart scrolls into view', async () => {
  const { page, close } = await openPage({ settings: { display: 'inline' }, spacer: true });
  try {
    assert.equal(await page.locator('dialog').count(), 0);
    await page.waitForTimeout(300);
    assert.equal((await sizeEvents(page)).length, 0, 'not sent while the chart is off screen');
    await page.locator('.size-chart__table-wrapper').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (window.dataLayer || []).some((entry) => entry.event === 'size_chart_open'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.size-chart__table-wrapper').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const opens = (await sizeEvents(page)).filter((entry) => entry.event === 'size_chart_open');
    assert.equal(opens.length, 1);
    assert.equal(opens[0].open_trigger, 'inline_view');
  } finally {
    await close();
  }
});

test('no trigger and no errors on a product without a chart', async () => {
  const { page, errors, close } = await openPage({ product: teeProduct({ noChart: true }) });
  try {
    assert.equal(await page.locator('[data-size-chart-open]').isVisible(), false);
    assert.equal(await page.locator('size-chart').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('Spanish page: translated labels, and the cm label follows the switch', async () => {
  const { page, close } = await openPage({ locale: 'es' });
  try {
    await page.locator('[data-size-chart-open]').click();
    assert.equal(await page.locator('.size-chart__subheading [data-unit-label]').textContent(), 'medidas en pulgadas');
    await page.locator('[data-size-chart-unit="cm"]').click();
    assert.equal(await page.locator('.size-chart__subheading [data-unit-label]').textContent(), 'medidas en centímetros');
    assert.equal(await page.locator('.size-chart__units').getAttribute('aria-label'), 'Unidad de medida');
  } finally {
    await close();
  }
});

test('320px phone: the table scrolls inside its box and the page does not scroll sideways', async () => {
  const { page, close } = await openPage({}, { width: 320, height: 640 });
  try {
    await page.locator('[data-size-chart-open]').click();
    await page.waitForFunction(() => document.getAnimations().length === 0);
    const sizes = await page.evaluate(() => {
      const dialog = document.querySelector('dialog').getBoundingClientRect();
      return { pageWidth: document.documentElement.scrollWidth, dialogLeft: dialog.left, dialogRight: dialog.right };
    });
    assert.ok(sizes.pageWidth <= 320, 'page width ' + sizes.pageWidth);
    assert.ok(sizes.dialogLeft >= 0 && sizes.dialogRight <= 320, JSON.stringify(sizes));
    const wrapper = page.locator('.size-chart__table-wrapper');
    assert.ok(await wrapper.evaluate((el) => el.scrollWidth > el.clientWidth), 'table scrolls inside its box');
    await wrapper.evaluate((el) => (el.scrollLeft = el.scrollWidth));
    const sizeCell = await page.locator('tbody tr').first().locator('th').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const wrap = el.closest('.size-chart__table-wrapper').getBoundingClientRect();
      return { left: box.left - wrap.left };
    });
    assert.ok(Math.abs(sizeCell.left) < 1, 'size column stays pinned while scrolling: ' + JSON.stringify(sizeCell));
    await page.screenshot({ path: require('node:path').join(__dirname, '..', 'screenshots', 'size-chart-320px.png') });
  } finally {
    await close();
  }
});

test('axe finds no accessibility violations in the open pop-up', async () => {
  const { page, close } = await openPage();
  try {
    await page.locator('[data-size-chart-open]').click();
    // Measure after the 0.2s fade-in: mid-animation, text is partly transparent.
    await page.waitForFunction(() => document.getAnimations().length === 0);
    await page.addScriptTag({ content: AXE_SOURCE });
    const result = await page.evaluate(() => window.axe.run(document.querySelector('dialog')));
    const summary = result.violations.map((violation) => violation.id + ': ' + violation.help);
    assert.deepEqual(summary, []);
    await page.screenshot({ path: require('node:path').join(__dirname, '..', 'screenshots', 'size-chart-desktop.png') });
  } finally {
    await close();
  }
});

const FIT_GUIDE = {
  settings: { diagram: 'tee' },
  blocks: [
    { type: 'fit_fact', shopify_attributes: '', settings: { text: 'Relaxed fit' } },
    { type: 'fit_fact', shopify_attributes: '', settings: { text: 'Measured with the garment laid flat' } },
  ],
};

async function waitForAnimations(page) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

test('fit guide: clicking a column header pins its line in the drawing; clicking again un-pins it', async () => {
  const { page, close } = await openPage(FIT_GUIDE);
  try {
    await page.locator('[data-size-chart-open]').click();
    const chest = page.locator('[data-measure-trigger="chest"]');
    await chest.click();
    assert.equal(await chest.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), 'chest');
    await waitForAnimations(page);
    const width = await page.locator('.size-chart__line[data-measure="chest"] path').evaluate((el) => getComputedStyle(el).strokeWidth);
    assert.equal(width, '3px');
    const otherWidth = await page.locator('.size-chart__line[data-measure="sleeve"] path').evaluate((el) => getComputedStyle(el).strokeWidth);
    assert.equal(otherWidth, '1.5px');

    await page.locator('[data-measure-trigger="sleeve"]').click();
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), 'sleeve');
    assert.equal(await chest.getAttribute('aria-pressed'), 'false');

    await page.locator('[data-measure-trigger="sleeve"]').click();
    assert.equal(await page.locator('[data-measure-trigger="sleeve"]').getAttribute('aria-pressed'), 'false');
    // Still hovering the sleeve column, so it stays previewed until the pointer leaves.
    await page.locator('.size-chart__heading').hover();
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), null);
  } finally {
    await close();
  }
});

test('fit guide: the keyboard can reach and press the measurement buttons', async () => {
  const { page, close } = await openPage(FIT_GUIDE);
  try {
    await page.locator('[data-size-chart-open]').click();
    await page.locator('[data-measure-trigger="length"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), 'length');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), null);
  } finally {
    await close();
  }
});

test('fit guide: hovering a column previews it, and leaving returns to the pinned one', async () => {
  const { page, close } = await openPage(FIT_GUIDE);
  try {
    await page.locator('[data-size-chart-open]').click();
    await waitForAnimations(page);
    await page.locator('[data-measure-trigger="chest"]').click();
    await page.locator('tbody tr').nth(2).locator('td[data-measure="sleeve"]').hover();
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), 'sleeve');
    await page.locator('.size-chart__heading').hover();
    assert.equal(await page.locator('size-chart').getAttribute('data-active-measure'), 'chest');
  } finally {
    await close();
  }
});

test('desktop: the pop-up is a full-height drawer on the right', async () => {
  const { page, close } = await openPage(FIT_GUIDE);
  try {
    await page.locator('[data-size-chart-open]').click();
    await waitForAnimations(page);
    const box = await page.locator('dialog').boundingBox();
    assert.ok(Math.abs(box.x + box.width - 1280) < 1, 'touches the right edge: ' + JSON.stringify(box));
    assert.ok(Math.abs(box.y) < 1 && Math.abs(box.height - 900) < 1, 'full height: ' + JSON.stringify(box));
    assert.ok(box.width <= 602, 'drawer width ' + box.width + ' (60rem plus a 1px border)');
    await page.locator('[data-measure-trigger="chest"]').click();
    await page.mouse.move(5, 5);
    await waitForAnimations(page);
    await page.screenshot({ path: require('node:path').join(__dirname, '..', 'screenshots', 'fit-guide-drawer-desktop.png') });
  } finally {
    await close();
  }
});

test('phone: the pop-up is a bottom sheet, and the page never scrolls sideways', async () => {
  const { page, close } = await openPage(FIT_GUIDE, { width: 375, height: 760 });
  try {
    await page.locator('[data-size-chart-open]').click();
    await waitForAnimations(page);
    const box = await page.locator('dialog').boundingBox();
    assert.ok(Math.abs(box.x) < 1 && Math.abs(box.width - 375) < 1, 'full width: ' + JSON.stringify(box));
    assert.ok(Math.abs(box.y + box.height - 760) < 1, 'sits on the bottom edge: ' + JSON.stringify(box));
    assert.ok(box.height <= 760 * 0.88 + 1, 'leaves the page visible above it');
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
    await page.screenshot({ path: require('node:path').join(__dirname, '..', 'screenshots', 'fit-guide-sheet-phone.png') });
  } finally {
    await close();
  }
});

test('centered pop-up style still works', async () => {
  const { page, close } = await openPage({ settings: { modal_style: 'centered' } });
  try {
    await page.locator('[data-size-chart-open]').click();
    await waitForAnimations(page);
    const box = await page.locator('dialog').boundingBox();
    assert.ok(box.x > 50 && box.x + box.width < 1230, 'centered: ' + JSON.stringify(box));
  } finally {
    await close();
  }
});

test('reduced motion: no animations when the visitor asks for less motion', async () => {
  const html = await buildPage(Object.assign({ product: teeProduct() }, FIT_GUIDE));
  const server = await serve(html);
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => window.customElements.get('size-chart'));
    await page.locator('[data-size-chart-open]').click();
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    const transition = await page.locator('.size-chart__line path').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    assert.equal(transition, '0s');
  } finally {
    await page.close();
    await server.close();
  }
});

test('axe finds no accessibility violations with the fit guide, facts and a pinned measurement', async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 760 }]) {
    const { page, close } = await openPage(FIT_GUIDE, viewport);
    try {
      await page.locator('[data-size-chart-open]').click();
      await waitForAnimations(page);
      await page.locator('[data-measure-trigger="chest"]').click();
      await waitForAnimations(page);
      await page.addScriptTag({ content: AXE_SOURCE });
      const result = await page.evaluate(() => window.axe.run(document.querySelector('dialog')));
      assert.deepEqual(result.violations.map((v) => v.id + ': ' + v.help), [], 'at ' + viewport.width + 'px');
    } finally {
      await close();
    }
  }
});

test('inline display with the fit guide: drawing beside the table on wide screens', async () => {
  const { page, close } = await openPage({ settings: { display: 'inline', diagram: 'tee' }, blocks: FIT_GUIDE.blocks });
  try {
    const diagram = await page.locator('.size-chart__diagram').boundingBox();
    const table = await page.locator('.size-chart__table-wrapper').boundingBox();
    assert.ok(diagram.x + diagram.width <= table.x, 'drawing sits left of the table');
    await page.locator('.size-chart__inline').screenshot({ path: require('node:path').join(__dirname, '..', 'screenshots', 'fit-guide-inline-desktop.png') });
  } finally {
    await close();
  }
});
