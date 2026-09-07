const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../js/core/clinic-hub-protocol.js');
const hub = require('../js/core/clinic-hub-main.js');

test('pairDevice provisions a random device key only after valid pairing proof', () => {
  const memory = { devices: {} };
  const runtime = hub.createHubRuntime({
    now: () => 1_000_000,
    state: memory,
    persist: () => {}
  });
  const pairing = runtime.createPairing();
  const nonce = 'pair-nonce';
  const proof = protocol.pairingProof(pairing.secret, 'dev-1', nonce);
  const result = runtime.pairDevice({ deviceId: 'dev-1', nonce, proof, deviceName: 'Consultorio 1' });
  assert.equal(result.ok, true);
  assert.match(memory.devices['dev-1'].keyHex, /^[a-f0-9]{64}$/);
  assert.equal(result.keyHex, memory.devices['dev-1'].keyHex);
  assert.throws(() => runtime.pairDevice({ deviceId: 'dev-2', nonce, proof: '0'.repeat(64) }));
});

test('encrypted RPC requires paired device, freshness and unique request id', async () => {
  const memory = { devices: { 'dev-1': { keyHex: '11'.repeat(32) } } };
  const runtime = hub.createHubRuntime({
    now: () => 2_000_000,
    state: memory,
    persist: () => {},
    rpcHandler: async ({ action, payload }) => ({ action, echoed: payload })
  });
  const key = Buffer.from(memory.devices['dev-1'].keyHex, 'hex');
  const request = { requestId: 'req-1', timestamp: 2_000_000, action: 'ping', payload: { value: 7 } };
  const envelope = protocol.seal(key, 'dev-1', request);
  const responseEnvelope = await runtime.handleEncryptedRpc('dev-1', envelope);
  const response = protocol.open(key, 'dev-1', responseEnvelope);
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { action: 'ping', echoed: { value: 7 } });

  await assert.rejects(() => runtime.handleEncryptedRpc('dev-1', envelope), /replay/i);
  const stale = protocol.seal(key, 'dev-1', { ...request, requestId: 'req-2', timestamp: 1_000_000 });
  await assert.rejects(() => runtime.handleEncryptedRpc('dev-1', stale), /expirada/i);
  await assert.rejects(() => runtime.handleEncryptedRpc('unknown', envelope), /pareado/i);
});
