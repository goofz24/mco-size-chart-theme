// Renders this theme's Liquid files outside Shopify, for tests only.
//
// It uses LiquidJS plus small stand-ins for Shopify-only filters and tags
// (t, asset_url, schema, style, doc...). It is close to Shopify's Liquid but
// not identical, so it checks our logic, not Shopify itself. The real check
// is still `shopify theme dev` on the development store.
const fs = require('node:fs');
const path = require('node:path');
const { Liquid } = require('liquidjs');

const THEME_ROOT = path.resolve(__dirname, '..', '..');

function readJsonWithComments(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  return JSON.parse(raw);
}

function lookup(object, dottedKey) {
  return dottedKey.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

const locales = {
  en: readJsonWithComments(path.join(THEME_ROOT, 'locales', 'en.default.json')),
  es: readJsonWithComments(path.join(THEME_ROOT, 'locales', 'es.json')),
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createEngine(localeCode) {
  const engine = new Liquid({
    root: [path.join(THEME_ROOT, 'snippets'), path.join(THEME_ROOT, 'sections')],
    extname: '.liquid',
    strictFilters: true,
  });

  // Block tags whose contents Shopify doesn't print: {% schema %}, {% doc %}.
  for (const name of ['schema', 'doc']) {
    engine.registerTag(name, {
      parse(token, remainTokens) {
        let next;
        while ((next = remainTokens.shift())) {
          if (next.name === 'end' + name) return;
        }
        throw new Error('tag ' + name + ' not closed');
      },
      render() {
        return '';
      },
    });
  }

  // {% style %} prints a <style> element around its rendered contents.
  engine.registerTag('style', {
    parse(token, remainTokens) {
      this.templates = [];
      const stream = this.liquid.parser
        .parseStream(remainTokens)
        .on('tag:endstyle', () => stream.stop())
        .on('template', (template) => this.templates.push(template))
        .on('end', () => {
          throw new Error('tag style not closed');
        });
      stream.start();
    },
    *render(ctx, emitter) {
      emitter.write('<style>');
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      emitter.write('</style>');
    },
  });

  const strings = locales[localeCode] || locales.en;
  engine.registerFilter('t', (key) => {
    const value = lookup(strings, key);
    if (typeof value !== 'string') throw new Error('Missing translation: ' + key);
    return value;
  });
  engine.registerFilter('asset_url', (name) => '/assets/' + name);
  engine.registerFilter('stylesheet_tag', (url) => '<link rel="stylesheet" href="' + url + '" media="all">');
  engine.registerFilter('inline_asset_content', (name) =>
    fs.readFileSync(path.join(THEME_ROOT, 'assets', name), 'utf8')
  );
  engine.registerFilter('image_url', (image) => (image && image.src) || '');
  engine.registerFilter('image_tag', (url) => '<img src="' + escapeHtml(url) + '" alt="">');
  return engine;
}

/**
 * Renders a section file.
 * @param {string} name - e.g. "size-chart"
 * @param {object} options - { product, section, settings, request, template, locale }
 */
async function renderSection(name, options) {
  const locale = options.locale || 'en';
  const engine = createEngine(locale);
  const source = fs.readFileSync(path.join(THEME_ROOT, 'sections', name + '.liquid'), 'utf8');
  const globals = {
    product: options.product,
    settings: options.settings || {},
    request: Object.assign({ design_mode: false, locale: { iso_code: locale } }, options.request),
    template: options.template || { name: 'product' },
  };
  const section = Object.assign({ id: 'template--1__size-chart', blocks: [], settings: {} }, options.section);
  return engine.parseAndRender(source, Object.assign({ section: section }, globals), { globals: globals });
}

/** Renders a snippet with the given parameters (as {% render 'name', ... %} would). */
async function renderSnippet(name, params, options) {
  const opts = options || {};
  const locale = opts.locale || 'en';
  const engine = createEngine(locale);
  const source = fs.readFileSync(path.join(THEME_ROOT, 'snippets', name + '.liquid'), 'utf8');
  const globals = {
    settings: opts.settings || {},
    request: Object.assign({ design_mode: false, locale: { iso_code: locale } }, opts.request),
    template: opts.template || { name: 'product' },
  };
  return engine.parseAndRender(source, Object.assign({}, params), { globals: globals });
}

/** Reads the section's default settings from its {% schema %}, like the theme editor does. */
function sectionDefaults(name) {
  const source = fs.readFileSync(path.join(THEME_ROOT, 'sections', name + '.liquid'), 'utf8');
  const schema = JSON.parse(/{% schema %}([\s\S]*?){% endschema %}/.exec(source)[1]);
  const defaults = {};
  for (const setting of schema.settings) {
    if (setting.id && setting.default !== undefined) defaults[setting.id] = setting.default;
  }
  return { schema: schema, defaults: defaults };
}

module.exports = { THEME_ROOT, renderSection, renderSnippet, sectionDefaults };
