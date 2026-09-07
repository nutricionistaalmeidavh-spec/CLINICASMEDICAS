const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const http = require('node:http');
const dgram = require('node:dgram');
const protocol = require('./clinic-hub-protocol');

const SERVICE_NAME = 'plennus-clinic-hub';
const DISCOVERY_PORT = 43126;
const HUB_PORT = 43127;
const DISCOVERY_MESSAGE = 'PLENNUS_CLINIC_DISCOVER_V1';
const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_HTTP_BODY_BYTES = 1024 * 1024;

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

function discoveryResponse(message, address, beacon) {
  if (!protocol.isPrivateAddress(address)) return null;
  if (Buffer.isBuffer(message)) message = message.toString('utf8');
  if (String(message || '').trim() !== DISCOVERY_MESSAGE) return null;
  return Buffer.from(JSON.stringify(beacon), 'utf8');
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
    for (const [requestId, timestamp] of seenRequests) if (timestamp < cutoff) seenRequests.delete(requestId);
  }

  return {
    createPairing() { return pairing.create(); },
    currentPairing() { return pairing.current(); },
    pairDevice({ deviceId, nonce, proof, deviceName = '' } = {}) {
      const id = String(deviceId || '').trim();
      if (!id || id.length > 128) throw new Error('Dispositivo inválido.');
      if (!pairing.verify(id, nonce, proof)) throw new Error('Pareamento inválido ou expirado.');
      const keyHex = crypto.randomBytes(32).toString('hex');
      state.devices[id] = { keyHex, deviceName: String(deviceName || '').slice(0, 120), pairedAt: Number(now()) };
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
      const result = await rpcHandler({ deviceId: id, action: String(request.action || ''), payload: request.payload ?? {}, requestId, timestamp: Number(request.timestamp) });
      return protocol.seal(key, id, { ok: true, requestId, timestamp: Number(now()), result });
    },
    device(deviceId) {
      const item = state.devices[String(deviceId || '')];
      return item ? { deviceName: item.deviceName || '', pairedAt: item.pairedAt || 0 } : null;
    }
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_HTTP_BODY_BYTES) {
        reject(new Error('Payload excede o limite permitido.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
  res.end(body);
}

function postJson(host, port, requestPath, payload, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!protocol.isPrivateAddress(host)) return reject(new Error('Destino fora da rede privada.'));
    const body = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
    const req = http.request({ hostname: host, port, path: requestPath, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': body.length }, timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if ((res.statusCode || 500) >= 400) return reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          resolve(parsed);
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo de conexão esgotado.')));
    req.on('error', reject);
    req.end(body);
  });
}

function createClinicHubTransport({ runtime, beacon } = {}) {
  if (!runtime) throw new Error('Runtime do Clinic Hub obrigatório.');
  let server = null;
  let discoverySocket = null;
  let activeBeacon = { ...(beacon || {}) };

  async function handleRequest(req, res) {
    const remoteAddress = req.socket.remoteAddress || '';
    if (!protocol.isPrivateAddress(remoteAddress)) return sendJson(res, 403, { ok: false, error: 'Origem fora da rede privada.' });
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true, beacon: activeBeacon });
    if (req.method !== 'POST') return sendJson(res, 404, { ok: false, error: 'Rota não encontrada.' });
    try {
      const body = await readJsonBody(req);
      if (req.url === '/pair') {
        const current = runtime.currentPairing();
        if (!current) throw new Error('Pareamento não está aberto.');
        const paired = runtime.pairDevice(body);
        const envelope = protocol.seal(protocol.pairingKey(current.secret), String(body.deviceId || ''), {
          deviceKeyHex: paired.keyHex,
          timestamp: Date.now()
        });
        return sendJson(res, 200, { ok: true, envelope });
      }
      if (req.url === '/rpc') {
        const envelope = await runtime.handleEncryptedRpc(body.deviceId, body.envelope);
        return sendJson(res, 200, { ok: true, envelope });
      }
      return sendJson(res, 404, { ok: false, error: 'Rota não encontrada.' });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message || 'Solicitação inválida.' });
    }
  }

  function startDiscovery() {
    return new Promise((resolve, reject) => {
      discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      discoverySocket.on('message', (message, rinfo) => {
        const response = discoveryResponse(message, rinfo.address, activeBeacon);
        if (response) discoverySocket.send(response, rinfo.port, rinfo.address, () => {});
      });
      discoverySocket.once('error', reject);
      discoverySocket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
        discoverySocket.removeListener('error', reject);
        resolve();
      });
    });
  }

  return {
    async start({ host = '0.0.0.0', port = HUB_PORT, discovery = true } = {}) {
      if (server) throw new Error('Clinic Hub já iniciado.');
      server = http.createServer((req, res) => { handleRequest(req, res).catch(error => sendJson(res, 500, { ok: false, error: error.message })); });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
      });
      const address = server.address();
      activeBeacon = { ...activeBeacon, port: typeof address === 'object' && address ? address.port : port };
      if (discovery) await startDiscovery();
      return { ok: true, host, port: activeBeacon.port, beacon: { ...activeBeacon } };
    },
    async stop() {
      if (discoverySocket) {
        const socket = discoverySocket;
        discoverySocket = null;
        try { socket.close(); } catch (_) { /* already closed */ }
      }
      if (server) {
        const current = server;
        server = null;
        await new Promise(resolve => current.close(() => resolve()));
      }
      return { ok: true };
    }
  };
}

module.exports = {
  SERVICE_NAME,
  DISCOVERY_PORT,
  HUB_PORT,
  DISCOVERY_MESSAGE,
  PAIRING_TTL_MS,
  MAX_HTTP_BODY_BYTES,
  buildBeacon,
  isValidDiscoveredHub,
  discoveryResponse,
  createEncryptedJsonStore,
  createPairingManager,
  createHubRuntime,
  postJson,
  createClinicHubTransport
};
