// Renders the Liquid files with LiquidJS and checks the HTML they produce.
// LiquidJS is close to Shopify's Liquid but not identical: these tests check
// our logic, and the development store is the final check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSection, renderSnippet, sectionDefaults } = require('../helpers/render');
const { teeProduct, teeSizeChart, metaobject } = require('../helpers/fixtures');

const { schema, defaults } = sectionDefaults('size-chart');

function section(settings) {
  return { settings: Object.assign({}, defaults, settings) };
}

function count(html, pattern) {
  return (html.match(pattern) || []).length;
}

test('schema: only on product templates, with a preset and a metaobject fallback setting', () => {
  assert.deepEqual(schema.enabled_on.templates, ['product']);
  assert.equal(schema.presets.length, 1);
  const fallback = schema.settings.find((setting) => setting.id === 'fallback_chart');
  assert.equal(fallback.type, 'metaobject');
  assert.equal(fallback.metaobject_type, 'size_chart');
});

test('renders the product chart as a pop-up with a full, accessible table', async () => {
  const html = await renderSection('size-chart', { product: teeProduct(), section: section() });
  assert.match(html, /<size-chart[^>]*data-display="modal"/);
  assert.match(html, /data-chart-source="product"/);
  assert.match(html, /<dialog id="SizeChartDialog-template--1__size-chart"/);
  assert.match(html, /aria-labelledby="SizeChartHeading-template--1__size-chart"/);
  assert.equal(count(html, /<tr data-size=/g), 5, 'one row per size');
  assert.equal(count(html, /<th scope="col">/g), 4, 'one header per column');
  assert.equal(count(html, /<th scope="row">/g), 5, 'size column is a row header');
  assert.match(html, /<td data-raw="34-36">34-36<\/td>/);
  assert.match(html, /<caption id="SizeChartCaption-template--1__size-chart" class="visually-hidden">\s*Unisex tees/);
  assert.match(html, /<p class="size-chart__subheading" aria-hidden="true">\s*Unisex tees/);
  assert.match(html, /Relaxed fit\. Between sizes\?/);
  assert.match(html, /<script type="application\/json" data-size-chart-variants>\s*\[1001,1002,1003,1004,1005,1006\]/);
});

test('finds the Size option position and the size selected on page load', async () => {
  const html = await renderSection('size-chart', { product: teeProduct(), section: section() });
  assert.match(html, /data-option-index="1"/);
  assert.match(html, /data-initial-size="M"/);
});

test('also finds a Spanish "Talla" option, and -1 when there is no size option', async () => {
  const talla = await renderSection('size-chart', {
    product: teeProduct({ sizeOptionName: 'Talla' }),
    section: section(),
  });
  assert.match(talla, /data-option-index="1"/);

  const noSize = await renderSection('size-chart', {
    product: teeProduct({ sizeOptionName: 'Material' }),
    section: section(),
  });
  assert.match(noSize, /data-option-index="-1"/);
  assert.match(noSize, /data-initial-size=""/);
});

test('uses the fallback chart when the product has none', async () => {
  const fallback = teeSizeChart({ name: 'Store default' });
  const html = await renderSection('size-chart', {
    product: teeProduct({ noChart: true }),
    section: section({ fallback_chart: fallback }),
  });
  assert.match(html, /data-chart-source="fallback"/);
  assert.match(html, /data-chart-name="Store default"/);
});

test('renders nothing for shoppers when there is no chart, and a notice in the theme editor', async () => {
  const product = teeProduct({ noChart: true });
  const shopper = await renderSection('size-chart', { product, section: section() });
  assert.equal(shopper.trim(), '');

  const editor = await renderSection('size-chart', { product, section: section(), request: { design_mode: true } });
  assert.match(editor, /size-chart__editor-notice/);
  assert.doesNotMatch(editor, /<size-chart/);
});

test('renders nothing when the chart JSON is missing rows or columns', async () => {
  for (const chart of [{ columns: ['Size'] }, { rows: [['S']] }, {}, 'not json']) {
    const html = await renderSection('size-chart', {
      product: teeProduct({ chart: teeSizeChart({ chart: chart }) }),
      section: section(),
    });
    assert.equal(html.trim(), '', JSON.stringify(chart));
  }
});

test('escapes merchant text so it cannot inject HTML', async () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const chart = teeSizeChart({
    name: evil,
    fit_note: '<script>alert(1)</script>',
    chart: { columns: ['Size', evil], rows: [[evil, evil]] },
  });
  const html = await renderSection('size-chart', {
    product: teeProduct({ title: evil, chart: chart }),
    section: section({ heading: evil }),
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert/);
  // Shopify escapes " as &quot;, LiquidJS as &#34;. Both are safe.
  assert.match(html, /(&quot;|&#34;)&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('inline display renders the chart on the page with no dialog', async () => {
  const html = await renderSection('size-chart', { product: teeProduct(), section: section({ display: 'inline' }) });
  assert.match(html, /data-display="inline"/);
  assert.doesNotMatch(html, /<dialog/);
  assert.match(html, /size-chart__inline/);
});

test('a chart entered in cm keeps cm as the source unit', async () => {
  const chart = metaobject({
    name: 'Shoes',
    unit: 'cm',
    chart: require('../../docs/examples/size-chart-shoes-cm.json'),
  });
  const html = await renderSection('size-chart', { product: teeProduct({ chart: chart }), section: section() });
  assert.match(html, /data-source-unit="cm"/);
  assert.match(html, /data-default-unit="cm"/);
  assert.match(html, /<td>40<\/td>/, 'EU size column is not marked for conversion');
  assert.match(html, /<td data-raw="25">25<\/td>/, 'foot length is marked for conversion');
  assert.match(html, /<th scope="col">EU size<\/th>/);
});

test('an unknown unit falls back to inches; a chosen first unit is respected', async () => {
  const odd = await renderSection('size-chart', {
    product: teeProduct({ chart: teeSizeChart({ unit: 'furlongs' }) }),
    section: section(),
  });
  assert.match(odd, /data-source-unit="in"/);
  const cmFirst = await renderSection('size-chart', { product: teeProduct(), section: section({ default_unit: 'cm' }) });
  assert.match(cmFirst, /data-default-unit="cm"/);
});

test('the unit switch can be hidden', async () => {
  const html = await renderSection('size-chart', { product: teeProduct(), section: section({ show_unit_toggle: false }) });
  assert.doesNotMatch(html, /data-size-chart-unit=/);
});

test('Spanish storefront text comes from locales/es.json', async () => {
  const html = await renderSection('size-chart', { product: teeProduct(), section: section(), locale: 'es' });
  assert.match(html, /aria-label="Unidad de medida"/);
  assert.equal(count(html, /<span data-unit-label>medidas en pulgadas<\/span>/g), 2);
  assert.match(html, /data-size-chart-unit="in" aria-pressed="true">pulg<\/button>/);
});

test('measure tip blocks render their title and text', async () => {
  const html = await renderSection('size-chart', {
    product: teeProduct(),
    section: Object.assign(section(), {
      blocks: [
        { type: 'measure_tip', shopify_attributes: '', settings: { title: 'Chest', text: '<p>Around the chest.</p>' } },
      ],
    }),
  });
  assert.match(html, /<h3 class="size-chart__tip-title h5">Chest<\/h3>/);
  assert.match(html, /<p>Around the chest\.<\/p>/);
});

test('size chart trigger renders a button the section can find', async () => {
  const html = await renderSnippet('size-chart-trigger', { label: 'Size chart', block: { shopify_attributes: '' } });
  assert.match(html, /<button type="button" class="size-chart-trigger__button link" data-size-chart-open aria-haspopup="dialog">/);
  assert.match(html, /Size chart\s*<\/button>/);
});

test('GTM loads only with a valid ID, when enabled, outside the theme editor', async () => {
  const on = { gtm_enabled: true, gtm_container_id: ' gtm-ab12cd3 ' };
  const head = await renderSnippet('google-tag-manager', { part: 'head' }, { settings: on });
  assert.match(head, /googletagmanager\.com\/gtm\.js\?id=/);
  assert.match(head, /'dataLayer', "GTM-AB12CD3"\)/, 'ID is trimmed and upper-cased');
  assert.match(head, /theme_template: "product"/);

  const body = await renderSnippet('google-tag-manager', { part: 'body' }, { settings: on });
  assert.match(body, /ns\.html\?id=GTM-AB12CD3/);

  const off = await renderSnippet('google-tag-manager', { part: 'head' }, {
    settings: { gtm_enabled: false, gtm_container_id: 'GTM-AB12CD3' },
  });
  assert.equal(off.trim(), '');

  const editor = await renderSnippet('google-tag-manager', { part: 'head' }, { settings: on, request: { design_mode: true } });
  assert.equal(editor.trim(), '');
});

test('GTM rejects IDs that are not GTM-XXXX letters and numbers', async () => {
  for (const id of ['', 'GTM-', 'G-ABC1234', 'UA-1234-1', 'GTM-AB"12', 'GTM-AB</script>', 'GTM-AB 12', 'GTM-ABCDEFGHIJKLMNOPQRSTUV']) {
    const html = await renderSnippet('google-tag-manager', { part: 'head' }, {
      settings: { gtm_enabled: true, gtm_container_id: id },
    });
    assert.equal(html.trim(), '', 'should reject ' + JSON.stringify(id));
  }
});
