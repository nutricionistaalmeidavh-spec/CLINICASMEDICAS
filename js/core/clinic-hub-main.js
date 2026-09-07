const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const protocol = require('./clinic-hub-protocol');

const SERVICE_NAME = 'plennus-clinic-hub';
const DISCOVERY_PORT = 43126;
const HUB_PORT = 43127;
const PAIRING_TTL_MS = 10 * 60 * 1000;

function buildBeacon({ hubId, clinicUid, port = HUB_PORT, hostname = os.hostname() } = {}) {
  return {
    service: SERVICE_NAME,
    protocolVersion: protocol.PROTOCOL_VERSION,
    hubId: String(hubId || ''),
    clinicUid: String(clinicUid || ''),
    port: Number(port),
    hostname: String(hostname || '')
  };
}

function isValidDiscoveredHub(beacon, address) {
  if (!protocol.isPrivateAddress(address)) return false;
  if (!beacon || beacon.service !== SERVICE_NAME) return false;
  if (Number(beacon.protocolVersion) !== protocol.PROTOCOL_VERSION) return false;
  if (!String(beacon.hubId || '').trim() || !String(beacon.clinicUid || '').trim()) return false;
  const port = Number(beacon.port);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function createEncryptedJsonStore({ filePath, safeStorage } = {}) {
  if (!filePath || !safeStorage) throw new Error('Encrypted store dependencies are required.');

  function ensureEncryption() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema operacional indisponível.');
  }

  return {
    read(fallback = null) {
      if (!fs.existsSync(filePath)) return fallback;
      ensureEncryption();
      const encoded = fs.readFileSync(filePath, 'utf8').trim();
      if (!encoded) return fallback;
      const encrypted = Buffer.from(encoded, 'base64');
      const plaintext = safeStorage.decryptString(encrypted);
      return JSON.parse(plaintext);
    },
    write(value) {
      ensureEncryption();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const encrypted = safeStorage.encryptString(JSON.stringify(value));
      const encoded = Buffer.from(encrypted).toString('base64');
      const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(temp, encoded, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temp, filePath);
      try { fs.chmodSync(filePath, 0o600); } catch (_) { /* Windows pode ignorar chmod */ }
      return { ok: true };
    }
  };
}

function createPairingManager({ now = Date.now, ttlMs = PAIRING_TTL_MS } = {}) {
  let active = null;
  const used = new Set();

  function create() {
    active = {
      secret: protocol.createPairingSecret(),
      expiresAt: Number(now()) + Number(ttlMs)
    };
    used.clear();
    return { ...active };
  }

  function verify(deviceId, nonce, proof) {
    if (!active || Number(now()) > active.expiresAt) return false;
    const replayKey = `${String(deviceId || '')}:${String(nonce || '')}:${String(proof || '')}`;
    if (used.has(replayKey)) return false;

    const expected = protocol.pairingProof(active.secret, deviceId, nonce);
    const supplied = String(proof || '');
    if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
    const expectedBuffer = Buffer.from(expected, 'hex');
    const suppliedBuffer = Buffer.from(supplied, 'hex');
    if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) return false;
    used.add(replayKey);
    return true;
  }

  return {
    create,
    verify,
    current() {
      if (!active || Number(now()) > active.expiresAt) return null;
      return { ...active };
    }
  };
}

function createHubRuntime({ now = Date.now, state = { devices: {} }, persist = () => {}, rpcHandler = async () => ({ ok: true }) } = {}) {
  if (!state.devices || typeof state.devices !== 'object') state.devices = {};
  const pairing = createPairingManager({ now });
  const seenRequests = new Map();

  function cleanupSeen() {
    const cutoff = Number(now()) - protocol.MAX_CLOCK_SKEW_MS;
    for (const [requestId, timestamp] of seenRequests) {
      if (timestamp < cutoff) seenRequests.delete(requestId);
    }
  }

  return {
    createPairing() {
      return pairing.create();
    },
    pairDevice({ deviceId, nonce, proof, deviceName = '' } = {}) {
      const id = String(deviceId || '').trim();
      if (!id || id.length > 128) throw new Error('Dispositivo inválido.');
      if (!pairing.verify(id, nonce, proof)) throw new Error('Pareamento inválido ou expirado.');
      const keyHex = crypto.randomBytes(32).toString('hex');
      state.devices[id] = {
        keyHex,
        deviceName: String(deviceName || '').slice(0, 120),
        pairedAt: Number(now())
      };
      persist(state);
      return { ok: true, keyHex };
    },
    async handleEncryptedRpc(deviceId, envelope) {
      const id = String(deviceId || '').trim();
      const device = state.devices[id];
      if (!device?.keyHex) throw new Error('Dispositivo não pareado.');
      const key = Buffer.from(device.keyHex, 'hex');
      const request = protocol.open(key, id, envelope);
      if (!protocol.isFreshTimestamp(request?.timestamp, Number(now()))) throw new Error('Solicitação expirada.');
      const requestId = String(request?.requestId || '').trim();
      if (!requestId || requestId.length > 128) throw new Error('requestId inválido.');
      cleanupSeen();
      if (seenRequests.has(requestId)) throw new Error('Replay de solicitação detectado.');
      seenRequests.set(requestId, Number(request.timestamp));
      const result = await rpcHandler({
        deviceId: id,
        action: String(request.action || ''),
        payload: request.payload ?? {},
        requestId,
        timestamp: Number(request.timestamp)
      });
      return protocol.seal(key, id, {
        ok: true,
        requestId,
        timestamp: Number(now()),
        result
      });
    },
    device(deviceId) {
      const item = state.devices[String(deviceId || '')];
      return item ? { deviceName: item.deviceName || '', pairedAt: item.pairedAt || 0 } : null;
    }
  };
}

module.exports = {
  SERVICE_NAME,
  DISCOVERY_PORT,
  HUB_PORT,
  PAIRING_TTL_MS,
  buildBeacon,
  isValidDiscoveredHub,
  createEncryptedJsonStore,
  createPairingManager,
  createHubRuntime
};
