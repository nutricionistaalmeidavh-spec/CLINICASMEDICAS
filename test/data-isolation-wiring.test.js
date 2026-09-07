const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('desktop entry installs isolation before the application becomes usable', () => {
  const source = read('updater-main.js');
  assert.match(source, /installLocalDataIsolation/);
  assert.match(source, /installLocalDataIsolation\(\{ app, ipcMain, safeStorage \}\)/);
});

test('preload exposes only session-bound professional database operations', () => {
  const source = read('preload.js');
  for (const channel of [
    'data-isolation:load-clinic',
    'data-isolation:save-clinic',
    'data-isolation:authenticate',
    'data-isolation:load-professional',
    'data-isolation:save-professional',
    'data-isolation:end-session'
  ]) {
    assert.match(source, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /professionalId\).*data-isolation:load-professional/);
});

test('renderer installs database routing before migrations and domain modules', () => {
  const source = read('js/core/navigation.js');
  const model = source.indexOf("'js/core/data-isolation.js'");
  const router = source.indexOf("'js/core/database-isolation-router.js'");
  const migrations = source.indexOf("'js/core/migrations.js'");
  const settings = source.indexOf("'js/domains/settings.js'");
  const professionalLink = source.indexOf("'js/domains/professional-user-link.js'");

  assert.ok(model >= 0);
  assert.ok(router > model);
  assert.ok(migrations > router);
  assert.ok(professionalLink > settings);
});

test('legacy encrypted database remains present as rollback source in the main process', () => {
  const source = read('main.js');
  const isolationMain = read('js/core/local-data-isolation-main.js');
  assert.match(source, /plennus-clinic\.db\.enc/);
  assert.match(isolationMain, /plennus-clinic\.db\.enc/);
  assert.doesNotMatch(isolationMain, /unlinkSync\(legacyPath/);
});