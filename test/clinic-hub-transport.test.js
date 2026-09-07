const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../js/core/clinic-hub-protocol.js');
const hub = require('../js/core/clinic-hub-main.js');

test('HTTP transport pairs a device without returning device key in plaintext and carries encrypted RPC', async () => {
  const state = { devices: {} };
  const runtime = hub.createHubRuntime({
    state,
    persist: () => {},
    rpcHandler: async ({ action }) => ({ pong: action === 'ping' })
  });
  const transport = hub.createClinicHubTransport({ runtime, beacon: hub.buildBeacon({ hubId: 'hub-1', clinicUid: 'clinic-1', port: 43127, hostname: 'pc' }) });
  const started = await transport.start({ host: '127.0.0.1', port: 0, discovery: false });
  try {
    const pairing = runtime.createPairing();
    const deviceId = 'dev-http-1';
    const nonce = 'nonce-http-1';
    const proof = protocol.pairingProof(pairing.secret, deviceId, nonce);
    const pairResponse = await hub.postJson('127.0.0.1', started.port, '/pair', { deviceId, nonce, proof, deviceName: 'Consultorio' });
    assert.equal(pairResponse.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(pairResponse, 'keyHex'), false);
    const pairingKey = protocol.pairingKey(pairing.secret);
    const provisioned = protocol.open(pairingKey, deviceId, pairResponse.envelope);
    assert.match(provisioned.deviceKeyHex, /^[a-f0-9]{64}$/);

    const key = Buffer.from(provisioned.deviceKeyHex, 'hex');
    const request = protocol.seal(key, deviceId, { requestId: 'req-http-1', timestamp: Date.now(), action: 'ping', payload: {} });
    const rpcResponse = await hub.postJson('127.0.0.1', started.port, '/rpc', { deviceId, envelope: request });
    const decoded = protocol.open(key, deviceId, rpcResponse.envelope);
    assert.equal(decoded.result.pong, true);
  } finally {
    await transport.stop();
  }
});

test('discovery response is emitted only for private request addresses and known discovery message', () => {
  const beacon = hub.buildBeacon({ hubId: 'hub-1', clinicUid: 'clinic-1', port: 43127, hostname: 'pc' });
  const valid = hub.discoveryResponse(hub.DISCOVERY_MESSAGE, '192.168.1.20', beacon);
  assert.deepEqual(JSON.parse(valid.toString('utf8')), beacon);
  assert.equal(hub.discoveryResponse('garbage', '192.168.1.20', beacon), null);
  assert.equal(hub.discoveryResponse(hub.DISCOVERY_MESSAGE, '8.8.8.8', beacon), null);
});
