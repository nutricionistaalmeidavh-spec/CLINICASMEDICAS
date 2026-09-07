const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('desktop bootstrap installs composite backup after local isolation and keeps authorization server-side', () => {
  const bootstrap = read('updater-main.js');
  const service = read('js/core/composite-backup-service.js');
  const isolation = bootstrap.indexOf('installLocalDataIsolation');
  const composite = bootstrap.indexOf('installCompositeBackupService({');
  assert.ok(isolation >= 0);
  assert.ok(composite > isolation);
  assert.match(service, /session\?\.role !== 'admin'|session\.role !== 'admin'|Apenas administradores/);
  assert.match(bootstrap, /session\.senderId !== event\.sender\.id/);
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
  assert.match(ui, /electronAPI\?\.compositeBackup/);
  assert.match(ui, /api\.save\(token, password\)/);
  assert.match(coordinator, /electronAPI\?\.compositeBackup/);
  assert.match(coordinator, /api\.open\(token, password\)/);
  assert.match(coordinator, /api\.commit\(token, staged\.sessionId\)/);
  assert.match(coordinator, /legacyFormat/);
  assert.ok(navigation.indexOf("'js/domains/composite-backup-ui.js'") > navigation.indexOf("'js/domains/settings.js'"));
});
