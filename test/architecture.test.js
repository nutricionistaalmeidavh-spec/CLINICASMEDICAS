const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('renderer loads extracted core modules after the legacy compatibility layer', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appIndex = html.indexOf('src="js/app.js"');
  const modulePaths = [
    'js/core/utils.js',
    'js/core/access-control.js',
    'js/core/clinic.js',
    'js/core/auth.js',
    'js/core/navigation.js',
  ];

  assert.ok(appIndex >= 0, 'legacy app compatibility layer must still be loaded');
  for (const modulePath of modulePaths) {
    const moduleIndex = html.indexOf(`src="${modulePath}"`);
    assert.ok(moduleIndex > appIndex, `${modulePath} must load after js/app.js`);
  }
});
