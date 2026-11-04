// Checks Shopify upload rules that Theme Check misses. Shopify's GitHub sync
// rejects a file that breaks them and replaces it on the store.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const configDir = path.join(__dirname, '..', '..', 'config');

// settings_data.json can start with a /* ... */ header that Shopify adds.
function readJson(file) {
  const text = fs.readFileSync(path.join(configDir, file), 'utf8');
  return JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\//, ''));
}

test('theme_info fits Shopify limits (theme_author is at most 25 characters)', () => {
  const info = readJson('settings_schema.json').find((group) => group.name === 'theme_info');
  assert.ok(info, 'settings_schema.json needs a theme_info group');
  for (const key of ['theme_name', 'theme_version', 'theme_author']) {
    assert.equal(typeof info[key], 'string', key + ' is required');
  }
  assert.ok(info.theme_author.length <= 25, 'theme_author has ' + info.theme_author.length + ' characters');
});

test('settings_schema.json keeps the Google Tag Manager settings', () => {
  const ids = readJson('settings_schema.json').flatMap((group) => (group.settings || []).map((s) => s.id));
  assert.ok(ids.includes('gtm_enabled'));
  assert.ok(ids.includes('gtm_container_id'));
});

test('settings_data.json defines the color schemes', () => {
  const data = readJson('settings_data.json');
  const current = typeof data.current === 'string' ? data.presets[data.current] : data.current;
  assert.ok(current.color_schemes && current.color_schemes['scheme-1'], 'scheme-1 is missing');
});
