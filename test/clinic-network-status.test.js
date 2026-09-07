const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/domains/clinic-network-status.js'), 'utf8');

test('network status UI never renders secrets or device keys', () => {
  assert.doesNotMatch(source, /deviceKeyHex|keyHex|pairingKey|senha.*status/i);
  assert.match(source, /pendingMutations/);
  assert.match(source, /Clinic Hub/);
});

test('login setup supports discover and pair before authentication', () => {
  assert.match(source, /renderLoginSetup/);
  assert.match(source, /clinicNetworkDiscover/);
  assert.match(source, /clinicNetworkPair/);
});

test('settings provides Hub start stop and temporary pairing code controls', () => {
  assert.match(source, /renderSettings/);
  assert.match(source, /clinicNetworkStartHub/);
  assert.match(source, /clinicNetworkStopHub/);
  assert.match(source, /clinicNetworkCreatePairing/);
});
