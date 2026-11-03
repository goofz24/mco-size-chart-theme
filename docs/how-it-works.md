# How it works

## Data: metaobjects and metafields

```
Product "MCO Logo Tee"
  metafield custom.size_chart  ──►  Metaobject entry "Unisex tees" (type size_chart)
                                      name:     Unisex tees
                                      unit:     in
                                      chart:    { "columns": [...], "rows": [...] }
                                      fit_note: Relaxed fit...
```

- A **metafield** is an extra field on a Shopify object (here, a product).
- A **metaobject** is a reusable record with its own fields, like a small database table you define in the admin.
- Pointing the metafield at a metaobject means many products share one chart. Fix a measurement once and every product using that chart updates.

In Liquid: `product.metafields.custom.size_chart.value` is the metaobject, and `size_chart.chart.value` is the parsed JSON.

## The section schema becomes editor settings

Everything inside `{% schema %}` in `sections/size-chart.liquid` is JSON that Shopify reads to build the theme editor panel:

- Each object in `"settings"` becomes a control. `"type": "select"` is a dropdown, `"checkbox"` a toggle, `"metaobject"` a picker for Size chart entries.
- The merchant's choice is available in Liquid as `section.settings.<id>`, for example `section.settings.display`.
- `"blocks"` are repeatable pieces the merchant can add, reorder and remove (here, "How to measure" tips, up to 6).
- `"presets"` makes the section appear in **Add section**. `"enabled_on"` limits it to product templates.

Saved choices are stored in `templates/product.json`, which is why that file changes when someone edits the theme in the admin.

## Rendering

1. Liquid looks up the chart: product metafield first, then the fallback setting. With no chart, shoppers get nothing (the editor shows a notice).
2. It finds which product option is the size (`Size` or `Talla`) and its position.
3. It renders the table. Each measurement keeps its original text in `data-raw`, for example `<td data-raw="34-36">34-36</td>`.
4. Merchant text is escaped (`| escape`), so a chart name can't inject HTML.

## JavaScript: `<size-chart>`

`assets/size-chart.js` defines a custom element. When the browser sees `<size-chart>`, it runs `connectedCallback()`, which:

- Adds `has-size-chart` to `<html>`, which un-hides the "Size chart" button (CSS). Products without a chart never show a dead button.
- Listens for clicks on `[data-size-chart-open]` **on the whole document**. Dawn replaces the product info HTML on every variant change, which would remove a listener attached to the button itself.
- Opens a native `<dialog>` with `showModal()`. The browser handles the Escape key and keeps keyboard focus inside the pop-up; focus goes back to the button on close.
- Subscribes to Dawn's `variant-change` event (`subscribe(PUB_SUB_EVENTS.variantChange, ...)`), reads the size from the variant, highlights the row and sends `size_select`. It ignores variants from other products (quick-add pop-ups use the same event) and color-only changes.

The pure logic (conversion, size matching, event payloads) is in `SizeChartUtils` at the top of the file, with no DOM access, so Node can test it.

## Fit guide

`snippets/size-chart-diagram.liquid` draws the garment as inline SVG. Each measurement line is a `<g data-measure="chest">`. The table snippet gives the matching column cells the same `data-measure` value and puts a numbered button in the header.

- Hovering a cell or line sets `data-active-measure="chest"` on `<size-chart>`; CSS then colors that line and column.
- The header button pins the measurement (`aria-pressed="true"`), so it works without a mouse.
- The drawing has a `<title>` ("How to measure: 1 Chest, 2 Length, 3 Sleeve"), so screen readers get the same information.

## Events

`SizeChartUtils.track()` does two things:

```js
window.dataLayer.push({ event: 'size_select', size: 'L', ... }); // for GTM
Shopify.analytics.publish('size_select', { size: 'L', ... });   // for Shopify Custom Pixels
```

Then GTM picks it up, as described in [gtm-ga4.md](gtm-ga4.md).

## Shopify CLI and GitHub

- `shopify theme dev` uploads the theme as a hidden development theme and gives a local preview URL that reloads when files change.
- `shopify theme check` runs Shopify's linter (Theme Check): schema errors, missing translations, unknown filters.
- With Shopify's **GitHub integration**, a branch is connected to a theme in the admin. Commits to the branch update the theme, and edits saved in the admin are committed back to the branch by the `shopify` bot. Always `git pull` before you start working.
