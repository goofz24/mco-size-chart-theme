// Example data shaped like what Shopify gives Liquid on a product page.
// The chart matches docs/examples/size-chart-tees.json.
const fs = require('node:fs');
const path = require('node:path');

const teeChart = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'examples', 'size-chart-tees.json'), 'utf8')
);

function metaobject(fields) {
  // Each metaobject field is read as field.value in Liquid.
  const result = {};
  for (const [key, value] of Object.entries(fields)) result[key] = { value: value };
  return result;
}

function teeSizeChart(overrides) {
  return metaobject(
    Object.assign(
      {
        name: 'Unisex tees',
        unit: 'in',
        chart: teeChart,
        fit_note: 'Relaxed fit. Between sizes? Size down for a closer fit.',
      },
      overrides
    )
  );
}

function variant(id, color, size) {
  return { id: id, title: color + ' / ' + size, options: [color, size], option1: color, option2: size };
}

function teeProduct(options) {
  const opts = options || {};
  const variants = [
    variant(1001, 'Black', 'S'),
    variant(1002, 'Black', 'M'),
    variant(1003, 'Black', 'L'),
    variant(1004, 'White', 'S'),
    variant(1005, 'White', 'M'),
    variant(1006, 'White', 'L'),
  ];
  const sizeName = opts.sizeOptionName || 'Size';
  return {
    id: 777,
    title: opts.title || 'MCO Logo Tee',
    variants: variants,
    selected_or_first_available_variant: variants[1],
    options_with_values: [
      { name: 'Color', values: ['Black', 'White'] },
      { name: sizeName, values: ['S', 'M', 'L'] },
    ],
    metafields: {
      custom: opts.noChart ? {} : { size_chart: { value: opts.chart || teeSizeChart() } },
    },
  };
}

module.exports = { teeChart, teeSizeChart, teeProduct, metaobject };
