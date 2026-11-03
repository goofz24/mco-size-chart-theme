// Tests for the pure functions in assets/size-chart.js (no browser needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../../assets/size-chart.js');

test('parseMeasurement reads numbers, decimals and ranges', () => {
  assert.deepEqual(utils.parseMeasurement('36'), { values: [36], separator: '' });
  assert.deepEqual(utils.parseMeasurement('8.25'), { values: [8.25], separator: '' });
  assert.deepEqual(utils.parseMeasurement('34-36'), { values: [34, 36], separator: '-' });
  assert.deepEqual(utils.parseMeasurement(' 34 – 36 '), { values: [34, 36], separator: '–' });
  assert.deepEqual(utils.parseMeasurement(29), { values: [29], separator: '' });
});

test('parseMeasurement rejects text that is not a measurement', () => {
  for (const value of ['One size', 'XL', '', '34-', '-3', '34-36-38', '1,5', null, undefined, NaN, {}]) {
    assert.equal(utils.parseMeasurement(value), null, 'should reject ' + String(value));
  }
});

test('convertValue uses 2.54 cm per inch both ways', () => {
  assert.equal(utils.convertValue(10, 'in', 'cm'), 25.4);
  assert.equal(utils.convertValue(25.4, 'cm', 'in'), 10);
  assert.equal(utils.convertValue(12, 'in', 'in'), 12);
  assert.throws(() => utils.convertValue(1, 'in', 'mm'));
});

test('formatNumber rounds to one decimal and drops ".0"', () => {
  assert.equal(utils.formatNumber(91.44), '91.4');
  assert.equal(utils.formatNumber(86.36), '86.4');
  assert.equal(utils.formatNumber(36.0), '36');
  assert.equal(utils.formatNumber(20.95), '21');
});

test('convertCell converts single values and ranges, keeping the separator', () => {
  assert.equal(utils.convertCell('34-36', 'in', 'cm'), '86.4-91.4');
  assert.equal(utils.convertCell('28', 'in', 'cm'), '71.1');
  assert.equal(utils.convertCell('8.25', 'in', 'cm'), '21');
  assert.equal(utils.convertCell('25', 'cm', 'in'), '9.8');
  assert.equal(utils.convertCell('86–91', 'cm', 'in'), '33.9–35.8');
});

test('convertCell leaves text, same-unit and unknown-unit cells unchanged', () => {
  assert.equal(utils.convertCell('One size', 'in', 'cm'), 'One size');
  assert.equal(utils.convertCell('34-36', 'in', 'in'), '34-36');
  assert.equal(utils.convertCell('34', 'in', 'mm'), '34');
  assert.equal(utils.convertCell(undefined, 'in', 'cm'), '');
});

test('findRowIndex matches sizes ignoring case and extra spaces', () => {
  const sizes = ['S', 'M', 'L', 'X-Large', '2XL'];
  assert.equal(utils.findRowIndex(sizes, 'M'), 1);
  assert.equal(utils.findRowIndex(sizes, ' x-large '), 3);
  assert.equal(utils.findRowIndex(sizes, '2xl'), 4);
  assert.equal(utils.findRowIndex(sizes, 'XS'), -1);
  assert.equal(utils.findRowIndex(sizes, ''), -1);
  assert.equal(utils.findRowIndex(sizes, null), -1);
});

test('sizeFromVariant reads options[] or optionN, and handles missing data', () => {
  const variant = { id: 1, options: ['Black', 'L'], option1: 'Black', option2: 'L' };
  assert.equal(utils.sizeFromVariant(variant, 1), 'L');
  assert.equal(utils.sizeFromVariant({ id: 2, option2: 'M' }, 1), 'M');
  assert.equal(utils.sizeFromVariant(variant, -1), null);
  assert.equal(utils.sizeFromVariant(null, 1), null);
  assert.equal(utils.sizeFromVariant({ id: 3, options: ['Black'] }, 1), null);
});

test('variantBelongsToProduct compares ids as strings', () => {
  assert.equal(utils.variantBelongsToProduct({ id: 1001 }, [1001, 1002]), true);
  assert.equal(utils.variantBelongsToProduct({ id: '1002' }, [1001, 1002]), true);
  assert.equal(utils.variantBelongsToProduct({ id: 9 }, [1001]), false);
  assert.equal(utils.variantBelongsToProduct(null, [1001]), false);
});

const context = { productId: 777, productTitle: 'MCO Logo Tee', chartName: 'Unisex tees', display: 'modal', unit: 'in' };

test('event names follow GA4 rules (snake_case, 40 characters max)', () => {
  for (const name of Object.values(utils.EVENTS)) {
    assert.match(name, /^[a-z][a-z0-9_]{0,39}$/);
  }
});

test('buildOpenEvent sends flat, string-safe parameters', () => {
  assert.deepEqual(utils.buildOpenEvent(context, 'button'), {
    event: 'size_chart_open',
    params: {
      product_id: '777',
      product_name: 'MCO Logo Tee',
      chart_name: 'Unisex tees',
      chart_display: 'modal',
      unit: 'in',
      open_trigger: 'button',
    },
  });
});

test('buildSizeSelectEvent records size, variant and whether the chart was seen', () => {
  const built = utils.buildSizeSelectEvent(context, { id: 1003 }, 'L', 2, true);
  assert.equal(built.event, 'size_select');
  assert.equal(built.params.variant_id, '1003');
  assert.equal(built.params.size, 'L');
  assert.equal(built.params.size_in_chart, true);
  assert.equal(built.params.chart_viewed, true);
  const missing = utils.buildSizeSelectEvent(context, { id: 1 }, 'XS', -1, false);
  assert.equal(missing.params.size_in_chart, false);
  assert.equal(missing.params.chart_viewed, false);
});

test('buildUnitChangeEvent reports the new unit', () => {
  assert.equal(utils.buildUnitChangeEvent(context, 'cm').params.unit, 'cm');
});

test('track pushes to dataLayer and to Shopify.analytics.publish', () => {
  const published = [];
  const win = { Shopify: { analytics: { publish: (name, data) => published.push([name, data]) } } };
  const entry = utils.track(win, 'size_chart_open', { product_id: '777' });
  assert.deepEqual(entry, { event: 'size_chart_open', product_id: '777' });
  assert.deepEqual(win.dataLayer, [{ event: 'size_chart_open', product_id: '777' }]);
  assert.deepEqual(published, [['size_chart_open', { product_id: '777' }]]);
});

test('track keeps working when Shopify analytics is missing or throws', () => {
  const plain = {};
  utils.track(plain, 'size_select', { size: 'M' });
  assert.equal(plain.dataLayer.length, 1);

  const broken = {
    dataLayer: [{ event: 'gtm.js' }],
    Shopify: {
      analytics: {
        publish: () => {
          throw new Error('pixel error');
        },
      },
    },
  };
  assert.doesNotThrow(() => utils.track(broken, 'size_select', { size: 'M' }));
  assert.equal(broken.dataLayer.length, 2);
  assert.equal(utils.track(null, 'x', {}), null);
});
