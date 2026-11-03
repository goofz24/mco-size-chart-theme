// Builds a small product page from the real section, snippets, CSS and JS,
// and serves it on localhost so Playwright can test the size chart in a real
// browser. Dawn's own constants.js and pubsub.js are loaded too, so variant
// changes use the same publish/subscribe code as on Shopify.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { THEME_ROOT, renderSection, renderSnippet, sectionDefaults } = require('./render');

// Stand-ins for the CSS variables Dawn's theme.liquid prints from theme settings.
const THEME_VARIABLES = `
  :root, .color-scheme-1 {
    --color-foreground: 18, 18, 18;
    --color-background: 255, 255, 255;
    --color-shadow: 18, 18, 18;
    --gradient-background: #ffffff;
    --font-body-family: Arial, sans-serif;
    --font-heading-family: Arial, sans-serif;
    --font-body-scale: 1;
    --font-heading-scale: 1;
    --popup-border-width: 1px;
    --popup-border-opacity: 0.1;
    --popup-corner-radius: 0px;
    --popup-shadow-horizontal-offset: 0px;
    --popup-shadow-vertical-offset: 4px;
    --popup-shadow-blur-radius: 5px;
    --popup-shadow-opacity: 0.05;
    --text-boxes-radius: 0px;
    --page-width: 120rem;
  }
  body { margin: 0; }
`;

async function buildPage(options) {
  const opts = options || {};
  const { defaults } = sectionDefaults('size-chart');
  const sectionHtml = await renderSection('size-chart', {
    product: opts.product,
    section: { settings: Object.assign({}, defaults, opts.settings) },
    locale: opts.locale,
  });
  const trigger = await renderSnippet('size-chart-trigger', {
    label: 'Size chart',
    block: { shopify_attributes: '' },
  });
  const spacer = opts.spacer ? '<div style="height: 2000px" data-spacer>Spacer</div>' : '';
  return `<!doctype html>
<html class="js" lang="${opts.locale || 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Size chart test page</title>
  <link rel="stylesheet" href="/assets/base.css">
  <style>${THEME_VARIABLES}</style>
  <script>
    window.publishedEvents = [];
    window.Shopify = { analytics: { publish: function (name, data) { window.publishedEvents.push([name, data]); } } };
  </script>
  <script src="/assets/constants.js" defer></script>
  <script src="/assets/pubsub.js" defer></script>
</head>
<body>
  <main class="page-width">
    <h1>${opts.product ? opts.product.title : ''}</h1>
    <div class="product-info" data-product-info>
      <fieldset><legend>Size</legend>
        <button type="button" id="before-trigger">Previous control</button>
      </fieldset>
      ${trigger}
      <button type="button">Add to cart</button>
    </div>
    ${spacer}
  </main>
  ${sectionHtml}
</body>
</html>`;
}

const CONTENT_TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

/** Starts a server for one page. Returns { url, close }. */
function serve(html) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/assets/')) {
      const file = path.join(THEME_ROOT, 'assets', path.basename(url.pathname));
      if (fs.existsSync(file)) {
        response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'text/plain' });
        response.end(fs.readFileSync(file));
        return;
      }
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: 'http://127.0.0.1:' + port + '/', close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}

module.exports = { buildPage, serve };
