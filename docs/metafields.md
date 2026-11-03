# Metafield and metaobject setup

The size chart data lives in the Shopify admin, not in the theme. You create two definitions once, then add charts and link them to products.

## 1. The "Size chart" metaobject definition

Shopify admin > **Settings** > **Custom data** > **Metaobjects** > **Add definition**.

- **Name:** Size chart
- **Type:** `size_chart` (Shopify fills this in from the name; it must be exactly `size_chart`)

| Field name | Key | Type | Notes |
|---|---|---|---|
| Name | `name` | Single line text | Required. For example "Unisex tees". |
| Unit | `unit` | Single line text | Required. Turn on **Limit to preset choices** with `in` and `cm`. |
| Chart | `chart` | JSON | Required. The table, see below. |
| Fit note | `fit_note` | Multi-line text | Optional. Shown under the table. |

If the definition shows **Access** or **Storefronts** options, turn storefront access on so the theme can read the entries. (Shopify's admin wording changes over time; if the chart doesn't appear later, check this first.)

## 2. The product metafield definition

Shopify admin > **Settings** > **Custom data** > **Products** > **Add definition**.

- **Name:** Size chart
- **Namespace and key:** `custom.size_chart`
- **Type:** Metaobject, then pick **Size chart** (one entry, not a list)

## 3. Add a chart

Shopify admin > **Content** > **Metaobjects** > **Size chart** > **Add entry**. If the entry has a **Status**, set it to **Active**; draft entries don't show on the storefront.

Paste this into the **Chart** field ([docs/examples/size-chart-tees.json](examples/size-chart-tees.json)):

```json
{
  "columns": ["Size", "Chest", "Body length", "Sleeve"],
  "rows": [
    ["S", "34-36", 28, 8.25],
    ["M", "38-40", 29, 8.5],
    ["L", "42-44", 30, 8.75],
    ["XL", "46-48", 31, 9],
    ["2XL", "50-52", 32, 9.25]
  ]
}
```

These numbers are example data for the demo store, not a real brand's measurements.

Rules for the JSON:

- `columns` is the header row. `rows` is a list of rows, each with one value per column.
- The **first column is the size**. It must match the product's size option values (`S`, `M`, `L`...) for the row to be highlighted. Case and extra spaces don't matter.
- Other cells can be numbers (`28`), decimals (`8.25`) or ranges (`"34-36"`). These are converted when the shopper switches units. Any other text (`"One size"`) is shown as-is.
- **Fit guide drawing:** columns named Chest, Length, Sleeve, Waist, Hip, Inseam or Foot (or Pecho, Largo, Manga, Cintura, Cadera, Entrepierna, Pie) get a numbered button that lights up the drawing. To match a column with another name, write it as an object: `{ "label": "Across", "measure": "chest" }`. Columns the chosen drawing doesn't show stay plain.
- If a column holds numbers that are **not** measurements, such as EU shoe sizes, write it as an object so it's never converted: `{ "label": "EU size", "measurement": false }`. See [docs/examples/size-chart-shoes-cm.json](examples/size-chart-shoes-cm.json).

## 4. Link it to a product

Open a product > scroll to **Metafields** > **Size chart** > pick "Unisex tees" > **Save**.

To use one chart for every product that doesn't have its own: theme editor > a product page > **Size chart** section > **Fallback size chart**.

## 5. Check it

- Products with a size option should be named `Size` (or `Talla`). Other names can be added in the section's **Size option names** setting.
- In the theme editor, a product with no chart shows a dashed notice in the Size chart section. Shoppers don't see it.
