const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const protocol = require('../js/core/clinic-hub-protocol.js');

test('accepts only loopback and private LAN addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.4.9', '172.31.255.1', '192.168.1.20', '169.254.10.2', '::1', 'fe80::1', 'fd12::5', '::ffff:192.168.0.8']) {
    assert.equal(protocol.isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2001:4860:4860::8888']) {
    assert.equal(protocol.isPrivateAddress(ip), false, ip);
  }
});

test('pairing secret has high entropy format and proof is deterministic', () => {
  const secret = protocol.createPairingSecret();
  assert.match(secret, /^(?:[A-F0-9]{4}-){4}[A-F0-9]{4}$/);
  const proofA = protocol.pairingProof(secret, 'device-a', 'nonce-1');
  const proofB = protocol.pairingProof(secret, 'device-a', 'nonce-1');
  const proofOther = protocol.pairingProof(secret, 'device-b', 'nonce-1');
  assert.equal(proofA, proofB);
  assert.notEqual(proofA, proofOther);
  assert.match(proofA, /^[a-f0-9]{64}$/);
});

test('AES-GCM envelope round-trips and rejects tampering', () => {
  const key = crypto.randomBytes(32);
  const payload = { action: 'shared.snapshot', timestamp: Date.now(), value: 'ok' };
  const envelope = protocol.seal(key, 'device-a', payload);
  assert.equal(envelope.v, 1);
  assert.deepEqual(protocol.open(key, 'device-a', envelope), payload);

  const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -2) + '00' };
  assert.throws(() => protocol.open(key, 'device-a', tampered));
  assert.throws(() => protocol.open(key, 'device-b', envelope));
});

test('timestamp freshness rejects stale and future replay windows', () => {
  const now = 1_800_000_000_000;
  assert.equal(protocol.isFreshTimestamp(now, now), true);
  assert.equal(protocol.isFreshTimestamp(now - 119_000, now), true);
  assert.equal(protocol.isFreshTimestamp(now - 121_000, now), false);
  assert.equal(protocol.isFreshTimestamp(now + 121_000, now), false);
});
