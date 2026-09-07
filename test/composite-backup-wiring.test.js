const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('desktop bootstrap installs composite backup after local isolation and before renderer use', () => {
  const source = read('updater-main.js');
  const isolation = source.indexOf('installLocalDataIsolation');
  const composite = source.indexOf('installCompositeBackupService({');
  assert.ok(isolation >= 0);
  assert.ok(composite > isolation);
  assert.match(source, /role !== 'admin'|Apenas administradores/);
  assert.match(source, /session\.senderId !== event\.sender\.id/);
});

test('preload exposes only high-level composite backup actions and no raw backup bytes', () => {
  const source = read('preload.js');
  for (const channel of ['composite-backup:save', 'composite-backup:open', 'composite-backup:commit', 'composite-backup:rollback', 'composite-backup:cancel']) {
    assert.match(source, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /compositeBackup:[\s\S]*readFile|compositeBackup:[\s\S]*writeFile/);
});

test('settings exports V3 through authenticated session and restore coordinator prefers V3', () => {
  const ui = read('js/domains/composite-backup-ui.js');
  const coordinator = read('js/domains/backup-restore-coordinator.js');
  const navigation = read('js/core/navigation.js');
  assert.match(ui, /DB\?\.session\?\.\(\)\?\.token/);
  assert.match(ui, /compositeBackup\?\.save/);
  assert.match(coordinator, /compositeBackup\?\.open/);
  assert.match(coordinator, /compositeBackup\.commit/);
  assert.match(coordinator, /legacyFormat/);
  assert.ok(navigation.indexOf("'js/domains/composite-backup-ui.js'") > navigation.indexOf("'js/domains/settings.js'"));
});
