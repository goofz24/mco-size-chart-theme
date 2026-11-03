# Google Tag Manager and GA4 setup

The theme pushes events into `window.dataLayer`. Google Tag Manager (GTM) listens for them and sends them to Google Analytics 4 (GA4).

```
Shopper clicks "Size chart"
  -> assets/size-chart.js runs dataLayer.push({ event: "size_chart_open", product_id: "...", ... })
  -> GTM: a Custom Event trigger matches "size_chart_open"
  -> GTM: a GA4 Event tag fires, reading the parameters with Data Layer Variables
  -> GA4 receives the event (see it live in DebugView)
```

## 1. GA4: create a property

1. [analytics.google.com](https://analytics.google.com) > **Admin** > **Create** > **Property**.
2. Add a **Web** data stream with your store's `myshopify.com` address.
3. Copy the **Measurement ID** (`G-...`).

## 2. GTM: create a container

1. [tagmanager.google.com](https://tagmanager.google.com) > **Create account**, with a **Web** container.
2. Copy the **container ID** (`GTM-...`).

## 3. Turn GTM on in the theme

Theme editor > **Theme settings** > **Google Tag Manager** > tick **Load Google Tag Manager** and paste the container ID > **Save**.

GTM does not load inside the theme editor, so open the store's preview or real URL to test.

## 4. GTM: variables

**Variables** > **User-Defined Variables** > **New** > **Data Layer Variable**. Create one for each name below (Data Layer Variable Name exactly as written, Version 2):

`product_id`, `product_name`, `chart_name`, `chart_display`, `unit`, `open_trigger`, `size`, `variant_id`, `size_in_chart`, `chart_viewed`

Name them `DLV - product_id` and so on, so they're easy to find.

Also turn on the built-in **Event** variable (**Variables** > **Configure** > **Event**).

## 5. GTM: trigger

**Triggers** > **New** > **Custom Event**:

- **Event name:** `^(size_chart_open|size_chart_unit_change|size_select)$`
- Tick **Use regex matching**
- **This trigger fires on:** All Custom Events
- Name it `CE - size chart events`

## 6. GTM: tags

1. **Google Tag** (sends the page views): Tag ID = your `G-...` ID, trigger **Initialization - All Pages**.
2. **Google Analytics: GA4 Event**:
   - **Measurement ID:** your `G-...` ID
   - **Event Name:** `{{Event}}` (the built-in variable, so one tag handles all three events)
   - **Event Parameters:** one row per variable, for example `size` = `{{DLV - size}}`
   - **Trigger:** `CE - size chart events`

## 7. Check that events fire

1. In GTM, click **Preview** and enter your store URL. Dev stores are password-protected: enter the store password in the window that opens.
2. Open a product with a size chart. Click **Size chart**, switch to **cm**, then pick another size.
3. In Tag Assistant, each action should show `size_chart_open`, `size_chart_unit_change` and `size_select` on the left, with the GA4 Event tag under **Tags Fired**.
4. In GA4 > **Admin** > **DebugView**, the same events should appear within a few seconds, with their parameters.

You can also check without GTM: open the browser console on the product page and type `dataLayer`.

## 8. See the parameters in GA4 reports

GA4 only shows custom parameters in reports after you register them: **Admin** > **Custom definitions** > **Create custom dimension**, scope **Event**, for `size`, `chart_name`, `open_trigger`, `unit` and `chart_viewed`. Standard reports can take 24 to 48 hours to show new data. DebugView and Realtime are immediate.

## 9. Publish

When the preview looks right, click **Submit** > **Publish** in GTM.

## Notes for a real store

- **Checkout and thank-you pages** don't use `theme.liquid`, so this GTM snippet doesn't run there. Shopify's supported way is a **Custom Pixel** (Settings > Customer events), which can also `analytics.subscribe('size_chart_open', ...)` because the theme publishes the same events with `Shopify.analytics.publish`.
- **Don't double count.** If the store also uses Shopify's Google & YouTube app for GA4, don't add a second page-view tag in GTM.
- **Consent.** This snippet loads GTM without asking. A store that needs a cookie banner should use Shopify's Customer Privacy API and Google Consent Mode.
