const path = require('node:path');
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const protocol = require('./clinic-hub-protocol');
const hubCore = require('./clinic-hub-main');
const hubDatabase = require('./clinic-hub-database');

const DISCOVERY_TIMEOUT_MS = 900;

function discoverHubs({ timeoutMs = DISCOVERY_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const found = new Map();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch (_) { /* no-op */ }
      resolve([...found.values()]);
    };
    const timer = setTimeout(finish, timeoutMs);
    socket.on('message', (message, rinfo) => {
      try {
        const beacon = JSON.parse(message.toString('utf8'));
        if (!hubCore.isValidDiscoveredHub(beacon, rinfo.address)) return;
        found.set(beacon.hubId, { ...beacon, address: rinfo.address });
      } catch (_) { /* ignore malformed discovery packets */ }
    });
    socket.once('error', error => {
      clearTimeout(timer);
      if (!settled) { settled = true; try { socket.close(); } catch (_) {} reject(error); }
    });
    socket.bind(0, '0.0.0.0', () => {
      try {
        socket.setBroadcast(true);
        const message = Buffer.from(hubCore.DISCOVERY_MESSAGE, 'utf8');
        socket.send(message, hubCore.DISCOVERY_PORT, '255.255.255.255', error => {
          if (error && !settled) { clearTimeout(timer); settled = true; try { socket.close(); } catch (_) {} reject(error); }
        });
      } catch (error) {
        clearTimeout(timer);
        if (!settled) { settled = true; try { socket.close(); } catch (_) {} reject(error); }
      }
    });
  });
}

function installClinicHub({ app, ipcMain, safeStorage, isolationService, logger = console } = {}) {
  if (!app || !ipcMain || !safeStorage || !isolationService) throw new Error('Clinic Network dependencies are required.');
  const networkRoot = path.join(app.getPath('userData'), 'data', 'network');
  const configStore = hubCore.createEncryptedJsonStore({ filePath: path.join(networkRoot, 'network-config.enc'), safeStorage });
  const hubStore = hubCore.createEncryptedJsonStore({ filePath: path.join(networkRoot, 'hub-state.enc'), safeStorage });
  const clientStore = hubCore.createEncryptedJsonStore({ filePath: path.join(networkRoot, 'client-state.enc'), safeStorage });

  let config = configStore.read({ mode: 'standalone', lastSyncAt: null });
  let hubState = hubStore.read({ hubId: crypto.randomUUID(), devices: {} });
  if (!hubState.hubId) hubState.hubId = crypto.randomUUID();
  if (!hubState.devices) hubState.devices = {};
  let clientState = clientStore.read({ deviceId: crypto.randomUUID(), hub: null, deviceKeyHex: null, pendingMutations: [] });
  if (!clientState.deviceId) clientState.deviceId = crypto.randomUUID();
  if (!Array.isArray(clientState.pendingMutations)) clientState.pendingMutations = [];

  let hubRuntime = null;
  let hubTransport = null;
  let hubController = null;
  const activeClients = new Map();

  const persistConfig = () => configStore.write(config);
  const persistHub = state => { hubState = state; hubStore.write(hubState); };
  const persistClient = () => clientStore.write(clientState);

  function sanitizedStatus() {
    return {
      mode: config.mode || 'standalone',
      hubRunning: Boolean(hubTransport),
      paired: Boolean(clientState.hub && clientState.deviceKeyHex),
      connected: activeClients.size > 0,
      pendingMutations: clientState.pendingMutations.length,
      lastSyncAt: config.lastSyncAt || null,
      hub: clientState.hub ? {
        hubId: clientState.hub.hubId,
        clinicUid: clientState.hub.clinicUid,
        hostname: clientState.hub.hostname,
        address: clientState.hub.address,
        port: clientState.hub.port
      } : null
    };
  }

  async function startHub() {
    if (hubTransport) return { ok: true, ...sanitizedStatus() };
    const clinicUid = await isolationService.getClinicUid();
    if (!clinicUid) throw new Error('Identidade da clínica indisponível; inicialize o banco local primeiro.');
    const databaseService = hubDatabase.createClinicHubDatabaseService({
      getBytes: isolationService.readClinicBytes,
      setBytes: isolationService.writeClinicBytes
    });
    hubController = hubDatabase.createClinicHubRpcController({ databaseService });
    hubRuntime = hubCore.createHubRuntime({ state: hubState, persist: persistHub, rpcHandler: request => hubController.handle(request) });
    hubTransport = hubCore.createClinicHubTransport({
      runtime: hubRuntime,
      beacon: hubCore.buildBeacon({ hubId: hubState.hubId, clinicUid, port: hubCore.HUB_PORT })
    });
    try {
      await hubTransport.start({ host: '0.0.0.0', port: hubCore.HUB_PORT, discovery: true });
    } catch (error) {
      hubTransport = null;
      hubRuntime = null;
      hubController = null;
      throw error;
    }
    config.mode = 'hub';
    persistConfig();
    return { ok: true, ...sanitizedStatus() };
  }

  async function stopHub({ persistMode = true } = {}) {
    if (hubTransport) await hubTransport.stop();
    hubTransport = null;
    hubRuntime = null;
    hubController = null;
    if (persistMode && config.mode === 'hub') {
      config.mode = 'standalone';
      persistConfig();
    }
    return { ok: true, ...sanitizedStatus() };
  }

  function createPairing() {
    if (!hubRuntime) throw new Error('Clinic Hub não está ativo.');
    const pairing = hubRuntime.createPairing();
    return { secret: pairing.secret, expiresAt: pairing.expiresAt };
  }

  async function pairClient({ hub, secret } = {}) {
    if (!hubCore.isValidDiscoveredHub(hub, hub?.address)) throw new Error('Hub LAN inválido.');
    const deviceId = clientState.deviceId;
    const nonce = crypto.randomBytes(16).toString('hex');
    const proof = protocol.pairingProof(secret, deviceId, nonce);
    const response = await hubCore.postJson(hub.address, Number(hub.port), '/pair', {
      deviceId, nonce, proof, deviceName: require('node:os').hostname()
    });
    const provisioned = protocol.open(protocol.pairingKey(secret), deviceId, response.envelope);
    if (!/^[a-f0-9]{64}$/.test(String(provisioned.deviceKeyHex || ''))) throw new Error('Chave de dispositivo inválida.');
    clientState.hub = {
      hubId: hub.hubId, clinicUid: hub.clinicUid, hostname: hub.hostname || '',
      address: hub.address, port: Number(hub.port)
    };
    clientState.deviceKeyHex = provisioned.deviceKeyHex;
    config.mode = 'client';
    persistClient();
    persistConfig();
    return { ok: true, ...sanitizedStatus() };
  }

  async function clientRpc(action, payload) {
    if (!clientState.hub || !clientState.deviceKeyHex) throw new Error('Este computador ainda não está pareado com o Clinic Hub.');
    if (!protocol.isPrivateAddress(clientState.hub.address)) throw new Error('Endereço do Hub não pertence à rede privada.');
    const key = Buffer.from(clientState.deviceKeyHex, 'hex');
    const requestId = crypto.randomUUID();
    const envelope = protocol.seal(key, clientState.deviceId, { requestId, timestamp: Date.now(), action, payload });
    const response = await hubCore.postJson(clientState.hub.address, clientState.hub.port, '/rpc', { deviceId: clientState.deviceId, envelope });
    const decoded = protocol.open(key, clientState.deviceId, response.envelope);
    if (!protocol.isFreshTimestamp(decoded.timestamp)) throw new Error('Resposta do Hub expirada.');
    if (decoded.requestId !== requestId) throw new Error('Resposta do Hub não corresponde à solicitação.');
    return decoded.result;
  }

  async function loginClient(event, credentials = {}) {
    const login = await clientRpc('session.login', { username: credentials.username, password: credentials.password });
    const localSession = isolationService.createNetworkProfessionalSession(login.user, event.sender.id);
    const snapshot = await clientRpc('shared.snapshot', { sessionToken: login.sessionToken });
    activeClients.set(event.sender.id, { sessionToken: login.sessionToken, localSessionToken: localSession.token, user: login.user });
    config.lastSyncAt = new Date().toISOString();
    persistConfig();
    return { ok: true, user: login.user, session: localSession, snapshot, network: sanitizedStatus() };
  }

  async function flushPending(event) {
    const active = activeClients.get(event.sender.id);
    if (!active) throw new Error('Sessão de rede não autenticada.');
    const remaining = [];
    for (const item of clientState.pendingMutations) {
      try {
        await clientRpc('shared.mutate', { sessionToken: active.sessionToken, command: item.command, data: item.data });
      } catch (error) {
        remaining.push(item);
        logger.warn('Mutação LAN permanece pendente:', error.message);
      }
    }
    clientState.pendingMutations = remaining;
    persistClient();
    return remaining.length;
  }

  async function syncClient(event) {
    const active = activeClients.get(event.sender.id);
    if (!active) throw new Error('Sessão de rede não autenticada.');
    await flushPending(event);
    const snapshot = await clientRpc('shared.snapshot', { sessionToken: active.sessionToken });
    config.lastSyncAt = new Date().toISOString();
    persistConfig();
    return { ok: true, snapshot, network: sanitizedStatus() };
  }

  async function mutateClient(event, { command, data = {} } = {}) {
    const active = activeClients.get(event.sender.id);
    if (!active) throw new Error('Sessão de rede não autenticada.');
    const mutationData = { ...data, mutationId: data.mutationId || crypto.randomUUID() };
    try {
      const result = await clientRpc('shared.mutate', { sessionToken: active.sessionToken, command, data: mutationData });
      return { ok: true, queued: false, result, mutationId: mutationData.mutationId };
    } catch (error) {
      if (!clientState.pendingMutations.some(item => item.data?.mutationId === mutationData.mutationId)) {
        clientState.pendingMutations.push({ command, data: mutationData, queuedAt: new Date().toISOString() });
        persistClient();
      }
      logger.warn('Hub indisponível; mutação adicionada à fila local:', error.message);
      return { ok: true, queued: true, mutationId: mutationData.mutationId, error: 'Clinic Hub temporariamente indisponível.' };
    }
  }

  async function disconnectClient(event) {
    const active = activeClients.get(event.sender.id);
    if (active) {
      try { await clientRpc('session.logout', { sessionToken: active.sessionToken }); } catch (_) { /* offline */ }
      activeClients.delete(event.sender.id);
    }
    return { ok: true, network: sanitizedStatus() };
  }

  ipcMain.handle('clinic-network:status', () => sanitizedStatus());
  ipcMain.handle('clinic-network:start-hub', async () => { try { return await startHub(); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('clinic-network:stop-hub', async () => { try { return await stopHub(); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('clinic-network:create-pairing', () => { try { return { ok: true, ...createPairing() }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('clinic-network:discover', async () => { try { return { ok: true, hubs: await discoverHubs() }; } catch (e) { return { ok: false, error: e.message, hubs: [] }; } });
  ipcMain.handle('clinic-network:pair', async (_event, input) => { try { return await pairClient(input); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('clinic-network:login', async (event, credentials) => { try { return await loginClient(event, credentials); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('clinic-network:sync', async event => { try { return await syncClient(event); } catch (e) { return { ok: false, error: e.message, network: sanitizedStatus() }; } });
  ipcMain.handle('clinic-network:mutate', async (event, input) => { try { return await mutateClient(event, input); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('clinic-network:disconnect', async event => disconnectClient(event));

  app.whenReady().then(() => {
    if (config.mode === 'hub') startHub().catch(error => logger.error('Falha ao iniciar Clinic Hub automaticamente:', error));
  });

  return { startHub, stopHub, createPairing, discoverHubs, pairClient, sanitizedStatus };
}

module.exports = { DISCOVERY_TIMEOUT_MS, discoverHubs, installClinicHub };
