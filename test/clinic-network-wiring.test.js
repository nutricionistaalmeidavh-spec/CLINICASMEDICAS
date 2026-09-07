const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('desktop installs Clinic Hub after local data isolation and keeps transport in main process', () => {
  const source = read('updater-main.js');
  assert.match(source, /const isolationService = installLocalDataIsolation/);
  assert.match(source, /installClinicHub\(\{ app, ipcMain, safeStorage, isolationService/);
  assert.ok(source.indexOf('installClinicHub') > source.indexOf('installLocalDataIsolation'));
});

test('local isolation exposes internal network session primitives without generic IPC', () => {
  const source = read('js/core/local-data-isolation-main.js');
  for (const name of ['readClinicBytes', 'writeClinicBytes', 'getClinicUid', 'createNetworkProfessionalSession']) assert.match(source, new RegExp(name));
  assert.doesNotMatch(source, /data-isolation:read-clinic-bytes/);
  assert.doesNotMatch(source, /data-isolation:create-network-professional-session/);
});

test('preload exposes a narrow Clinic Network bridge and no sockets, keys or raw RPC', () => {
  const source = read('preload.js');
  for (const channel of ['clinic-network:status','clinic-network:start-hub','clinic-network:stop-hub','clinic-network:create-pairing','clinic-network:discover','clinic-network:pair','clinic-network:login','clinic-network:sync','clinic-network:mutate','clinic-network:disconnect']) {
    assert.match(source, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /require\(['"](?:http|dgram|net|tls)['"]\)/);
  assert.doesNotMatch(source, /deviceKeyHex/);
});

test('renderer loads Clinic Network adapter before auth and domain modules', () => {
  const nav = read('js/core/navigation.js');
  const network = nav.indexOf("'js/core/clinic-network-client.js'");
  const auth = read('js/core/auth.js');
  assert.ok(network >= 0);
  assert.match(auth, /PlennusClinicNetwork/);
  assert.match(auth, /authenticateRemoteProfessional/);
});

test('database router can apply a shared snapshot without exposing network transport', () => {
  const source = read('js/core/database-isolation-router-safe.js');
  assert.match(source, /syncSharedSnapshot/);
  assert.match(source, /setNetworkClientMode/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket/);
});
