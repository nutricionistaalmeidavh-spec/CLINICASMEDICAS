const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');

const protocol = require('../js/core/clinic-hub-protocol.js');
const hubCore = require('../js/core/clinic-hub-main.js');
const hubDb = require('../js/core/clinic-hub-database.js');

async function createFixture() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY,nome TEXT,usuario TEXT,senha TEXT,nivel TEXT,ativo INTEGER,profissional_id INTEGER);
    CREATE TABLE profissionais (id INTEGER PRIMARY KEY,nome TEXT,especialidade TEXT,ativo INTEGER,uid TEXT);
    CREATE TABLE pacientes (id INTEGER PRIMARY KEY,nome TEXT,telefone TEXT,celular TEXT,email TEXT,cpf TEXT,ativo INTEGER,uid TEXT);
    CREATE TABLE agenda (id INTEGER PRIMARY KEY,paciente_id INTEGER,profissional_id INTEGER,data TEXT,hora TEXT,status TEXT,observacao TEXT);
    CREATE TABLE procedimentos (id INTEGER PRIMARY KEY,nome TEXT,valor_particular REAL,ativo INTEGER);
    CREATE TABLE convenios (id INTEGER PRIMARY KEY,nome TEXT,ativo INTEGER);
    CREATE TABLE configuracoes (chave TEXT PRIMARY KEY,valor TEXT);
    CREATE TABLE documentos_templates (id INTEGER PRIMARY KEY,nome TEXT,tipo TEXT,conteudo TEXT,ativo INTEGER);
    CREATE TABLE grade_horarios (id INTEGER PRIMARY KEY,profissional_id INTEGER,dia_semana INTEGER,hora_inicio TEXT,hora_fim TEXT,intervalo_minutos INTEGER);
    INSERT INTO profissionais VALUES (1,'Dra Ana','Clínica',1,'prof-a');
    INSERT INTO usuarios VALUES (1,'Dra Ana','ana','${crypto.createHash('sha256').update('senha123').digest('hex')}','medico',1,1);
    INSERT INTO pacientes VALUES (10,'Paciente A','111',NULL,NULL,NULL,1,'pat-a');
    INSERT INTO agenda VALUES (100,10,1,'07/09/2026','09:00','espera',NULL);
    INSERT INTO configuracoes VALUES ('clinic_uid','clinic-e2e'),('nome_clinica','Clínica E2E');
  `);
  let bytes = Array.from(db.export());
  db.close();
  return {
    getBytes: () => bytes,
    setBytes: next => { bytes = Array.from(next); },
    inspect: sql => {
      const current = new SQL.Database(new Uint8Array(bytes));
      try { return current.exec(sql)?.[0]?.values || []; }
      finally { current.close(); }
    }
  };
}

function createRpcClient({ deviceId, key, getPort }) {
  return async function rpc(action, payload) {
    const requestId = crypto.randomUUID();
    const envelope = protocol.seal(key, deviceId, {
      requestId,
      timestamp: Date.now(),
      action,
      payload
    });
    const response = await hubCore.postJson('127.0.0.1', getPort(), '/rpc', { deviceId, envelope }, 600);
    const decoded = protocol.open(key, deviceId, response.envelope);
    assert.equal(decoded.requestId, requestId);
    return decoded.result;
  };
}

test('pairing -> login -> snapshot -> mutation -> offline queue -> reconnect keeps shared agenda consistent', async () => {
  const storage = await createFixture();
  const service = hubDb.createClinicHubDatabaseService(storage);
  const controller = hubDb.createClinicHubRpcController({ databaseService: service });
  const runtime = hubCore.createHubRuntime({
    state: { devices: {} },
    persist: () => {},
    rpcHandler: request => controller.handle(request)
  });
  const transport = hubCore.createClinicHubTransport({
    runtime,
    beacon: hubCore.buildBeacon({ hubId: 'hub-e2e', clinicUid: 'clinic-e2e' })
  });

  let running = await transport.start({ host: '127.0.0.1', port: 0, discovery: false });
  let port = running.port;
  const deviceId = 'professional-device-e2e';
  const pairing = runtime.createPairing();
  const nonce = crypto.randomBytes(16).toString('hex');
  const proof = protocol.pairingProof(pairing.secret, deviceId, nonce);

  try {
    const pairResponse = await hubCore.postJson('127.0.0.1', port, '/pair', { deviceId, nonce, proof, deviceName: 'Consultório 1' });
    const provisioned = protocol.open(protocol.pairingKey(pairing.secret), deviceId, pairResponse.envelope);
    const key = Buffer.from(provisioned.deviceKeyHex, 'hex');
    assert.equal(key.length, 32);

    const rpc = createRpcClient({ deviceId, key, getPort: () => port });
    const login = await rpc('session.login', { username: 'ana', password: 'senha123' });
    assert.match(login.sessionToken, /^[a-f0-9]{64}$/);

    const initial = await rpc('shared.snapshot', { sessionToken: login.sessionToken });
    assert.deepEqual(initial.tables.agenda.map(row => [Number(row.id), row.status]), [[100, 'espera']]);

    await rpc('shared.mutate', {
      sessionToken: login.sessionToken,
      command: 'agenda.updateStatus',
      data: { mutationId: 'e2e-atendimento', appointmentId: 100, status: 'atendimento' }
    });
    const inService = await rpc('shared.snapshot', { sessionToken: login.sessionToken });
    assert.equal(inService.tables.agenda[0].status, 'atendimento');

    await transport.stop();
    const pending = [];
    const offlineMutation = {
      sessionToken: login.sessionToken,
      command: 'agenda.updateStatus',
      data: { mutationId: 'e2e-realizado', appointmentId: 100, status: 'realizado' }
    };
    await assert.rejects(() => rpc('shared.mutate', offlineMutation));
    pending.push(offlineMutation);
    assert.equal(pending.length, 1);

    running = await transport.start({ host: '127.0.0.1', port: 0, discovery: false });
    port = running.port;
    for (const mutation of pending.splice(0)) await rpc('shared.mutate', mutation);
    assert.equal(pending.length, 0);

    const afterReconnect = await rpc('shared.snapshot', { sessionToken: login.sessionToken });
    assert.equal(afterReconnect.tables.agenda[0].status, 'realizado');
    assert.deepEqual(storage.inspect("SELECT event_type,mutation_id,dispatched_at FROM workflow_domain_events WHERE mutation_id='e2e-realizado'"), [
      ['appointment.completed', 'e2e-realizado', null]
    ]);

    const replay = await rpc('shared.mutate', offlineMutation);
    assert.equal(replay.duplicate, true);
    assert.equal(storage.inspect("SELECT COUNT(*) FROM workflow_domain_events WHERE mutation_id='e2e-realizado'")[0][0], 1);
    assert.equal(storage.inspect("SELECT COUNT(*) FROM network_mutations WHERE mutation_id='e2e-realizado'")[0][0], 1);
  } finally {
    await transport.stop().catch(() => {});
  }
});
