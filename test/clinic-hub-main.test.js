const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hub = require('../js/core/clinic-hub-main.js');

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(String(value).split('').reverse().join(''), 'utf8'),
    decryptString: buffer => Buffer.from(buffer).toString('utf8').split('').reverse().join('')
  };
}

test('discovery beacon contains service metadata only and no PII', () => {
  const beacon = hub.buildBeacon({ hubId: 'hub-1', clinicUid: 'clinic-1', port: 43127, hostname: 'recepcao-pc', patientName: 'Maria' });
  assert.deepEqual(Object.keys(beacon).sort(), ['clinicUid', 'hostname', 'hubId', 'port', 'protocolVersion', 'service'].sort());
  assert.equal(beacon.service, 'plennus-clinic-hub');
  assert.equal(JSON.stringify(beacon).includes('Maria'), false);
});

test('discovered hub is accepted only from private addresses and matching protocol', () => {
  const beacon = hub.buildBeacon({ hubId: 'hub-1', clinicUid: 'clinic-1', port: 43127, hostname: 'pc' });
  assert.equal(hub.isValidDiscoveredHub(beacon, '192.168.1.15'), true);
  assert.equal(hub.isValidDiscoveredHub(beacon, '8.8.8.8'), false);
  assert.equal(hub.isValidDiscoveredHub({ ...beacon, protocolVersion: 999 }, '192.168.1.15'), false);
});

test('encrypted JSON store never persists device key as plaintext', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plennus-hub-'));
  try {
    const filePath = path.join(dir, 'pairings.enc');
    const store = hub.createEncryptedJsonStore({ filePath, safeStorage: fakeSafeStorage() });
    store.write({ devices: { dev1: { keyHex: 'a'.repeat(64) } } });
    const disk = fs.readFileSync(filePath, 'utf8');
    assert.equal(disk.includes('a'.repeat(64)), false);
    assert.deepEqual(store.read(), { devices: { dev1: { keyHex: 'a'.repeat(64) } } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pairing manager validates proof once within expiry', () => {
  const manager = hub.createPairingManager({ now: () => 1000 });
  const pairing = manager.create();
  const nonce = 'nonce-1';
  const proof = require('../js/core/clinic-hub-protocol.js').pairingProof(pairing.secret, 'dev-1', nonce);
  assert.equal(manager.verify('dev-1', nonce, proof), true);
  assert.equal(manager.verify('dev-1', nonce, proof), false);
});
